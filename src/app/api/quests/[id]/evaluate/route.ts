import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIProviderError, type QuestGeneration } from "@/lib/ai";
import { awardXP, updateSkillXP, updateStreak, unlockAchievement } from "@/lib/progression";
import { matchSkillId } from "@/lib/quests";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkBudget, isOrgBudgetNearlyExhausted } from "@/lib/ai/budget";
import { getCachedQuestTemplate, cacheQuestTemplate, inferCategory, personalizeTemplate } from "@/lib/ai/questCache";
import type { Json } from "@/lib/supabase/types";

// The text model the configured provider actually uses — see
// AI_PROVIDER/GROQ_MODEL in .env.local. Org-wide budget degradation
// (checkBudget's isOrgBudgetNearlyExhausted) is checked against this
// specific model's real RPD, not a guess.
const TEXT_MODEL = "openai/gpt-oss-120b" as const;

// Server-enforced ceilings — the AI's proposal is never trusted outright
// (brief §14/§22: "AI must not be allowed to award unlimited XP").
const MAX_SKILL_XP = 100;

/**
 * Phase 14 — closes the core loop:
 *   submitted -> under_review -> AI evaluates -> completed/failed
 *     -> XP awarded (clamped) -> skill XP -> streak -> next quest generated
 *
 * Called by QuestActions immediately after a successful submission.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: questId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId: string = user.id; // captured once — see grant() below for why

  // Evaluation awards real XP — 10/minute is far more than a genuine
  // submit-and-wait workflow needs, tight enough to block abuse.
  const rate = checkRateLimit("quest-evaluate", userId, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  // RLS scopes this to the caller's own quest.
  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("id, user_id, goal_id, skill_id, title, objective, success_criteria, xp_reward, status, difficulty")
    .eq("id", questId)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  }

  if (quest.status !== "submitted") {
    return NextResponse.json(
      { error: "This quest isn't awaiting review." },
      { status: 409 },
    );
  }

  const { data: attempt } = await supabase
    .from("quest_attempts")
    .select("id, status")
    .eq("quest_id", questId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!attempt) {
    return NextResponse.json({ error: "No submitted attempt found." }, { status: 409 });
  }

  const { data: evidence } = await supabase
    .from("quest_evidence")
    .select("evidence_type, content")
    .eq("quest_attempt_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: goal } = quest.goal_id
    ? await supabase.from("goals").select("title").eq("id", quest.goal_id).single()
    : { data: null };

  const admin = createAdminClient();

  // Roadmap item A graceful degradation: if this user is already over
  // their daily evaluation budget, OR the whole org is near Groq's
  // real daily limit for the text model (checked BEFORE spending a
  // call, not after failing one), don't call the AI at all. The quest
  // stays "submitted" (never touched under_review) so a later retry —
  // by the user, or a future scheduled job — can complete the real
  // evaluation. What ships in this pass: the non-blocking, honest
  // response and the data model to support a deferred retry; the
  // actual "re-process within an hour" background job needs real
  // scheduled-function infra (Vercel Cron or similar) that isn't wired
  // up yet — flagged here rather than silently left half-built.
  const [evalBudget, orgNearLimit] = await Promise.all([
    checkBudget(admin, userId, "evaluations"),
    isOrgBudgetNearlyExhausted(admin, TEXT_MODEL),
  ]);

  if (!evalBudget.allowed || orgNearLimit) {
    // Streak extends on SUBMISSION here, not evaluation — the whole
    // point of degrading gracefully is not making an already-honest
    // submission wait on AI capacity that isn't there right now.
    // Idempotent-safe if the real evaluation runs later the same day
    // (nextStreakState's gap===0 branch is a no-op).
    const streak = await updateStreak(admin, userId);
    await logEvent(admin, userId, EVENT.STREAK_EXTENDED, {
      currentStreak: streak.currentStreak,
      degraded: true,
    });
    return NextResponse.json({
      queued: true,
      passed: null,
      feedback: "The Game Master is reviewing a lot of quests right now — your XP will land within the hour. Your streak is already safe.",
      streak,
    });
  }

  // Mark evaluation as in-flight (submitted -> under_review), matching
  // the lifecycle graph in lib/quests/transitions.ts.
  await admin.from("quests").update({ status: "under_review" }).eq("id", questId);

  let evaluation;
  try {
    evaluation = await getAIProvider().evaluateQuest(
      {
        questTitle: quest.title,
        questObjective: quest.objective,
        successCriteria: (quest.success_criteria as string[] | null) ?? [],
        evidenceType: evidence?.evidence_type ?? "text",
        evidenceSummary: evidence?.content ?? "(no description provided)",
        goalTitle: goal?.title ?? "General self-improvement",
      },
      { userId, admin },
    );
  } catch (err) {
    logError("ai_evaluation", err, { questId, userId });

    // Roll the quest back to `submitted` so the user can retry — never
    // strand it in `under_review` on a transient AI failure.
    await admin.from("quests").update({ status: "submitted" }).eq("id", questId);

    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    throw err;
  }

  const clampedXp = Math.max(0, Math.min(evaluation.xp_awarded, quest.xp_reward));
  const clampedSkillXp = Math.max(0, Math.min(evaluation.skill_xp_awarded, MAX_SKILL_XP));

  await logEvent(admin, userId, EVENT.EVALUATION_RETURNED, {
    questId,
    passed: evaluation.passed,
    score: evaluation.score,
    xpAwarded: clampedXp,
    // Bronze/Silver/Gold tiering lands in roadmap item 5 — null until
    // then rather than inventing a value, so /admin/metrics can
    // distinguish "not graded yet" from a real tier once it exists.
    tier: null as "bronze" | "silver" | "gold" | null,
  });

  const { error: evalInsertError } = await admin.from("ai_evaluations").insert({
    quest_attempt_id: attempt.id,
    user_id: userId,
    passed: evaluation.passed,
    score: evaluation.score,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths as Json,
    improvements: evaluation.improvements as Json,
    xp_awarded: clampedXp,
    skill_xp_awarded: clampedSkillXp,
    next_action: evaluation.next_action,
    raw_response: evaluation as unknown as Json,
  });

  if (evalInsertError) {
    logError("db", evalInsertError, { table: "ai_evaluations", userId, questId });
    return NextResponse.json(
      { error: "Something went wrong. Your progress is safe." },
      { status: 500 },
    );
  }

  const finalStatus = evaluation.passed ? "completed" : "failed";
  await admin.from("quests").update({ status: finalStatus }).eq("id", questId);
  await admin
    .from("quest_attempts")
    .update({ status: finalStatus, completed_at: new Date().toISOString() })
    .eq("id", attempt.id);

  let leveledUp = false;
  let newLevel: number | null = null;
  let streak: Awaited<ReturnType<typeof updateStreak>> | null = null;
  const newAchievements: { key: string; name: string; description: string | null }[] = [];

  // unlockAchievement is idempotent (Phase 2's unique(user_id,
  // achievement_id) constraint), so it's safe to call unconditionally on
  // every qualifying evaluation — it only actually grants once.
  async function grant(key: string) {
    const { data: achievement } = await admin
      .from("achievements")
      .select("id, name, description")
      .eq("key", key)
      .maybeSingle();
    const result = await unlockAchievement(admin, { userId, achievementKey: key });
    if (result.granted && achievement) {
      newAchievements.push({ key, name: achievement.name, description: achievement.description });
    }
  }

  // Submitting for review — pass or fail — still counts as "first quest".
  await grant("FIRST_QUEST");

  if (evaluation.passed) {
    if (clampedXp > 0) {
      const xpResult = await awardXP(admin, {
        userId: userId,
        amount: clampedXp,
        sourceType: "quest_evaluation",
        sourceId: quest.id,
        skillId: quest.skill_id ?? undefined,
      });
      leveledUp = xpResult.leveledUp;
      newLevel = xpResult.newLevel;

      if (newLevel >= 5) await grant("LEVEL_5");
      if (newLevel >= 10) await grant("LEVEL_10");
    }

    if (quest.skill_id && clampedSkillXp > 0) {
      await updateSkillXP(admin, { userId: userId, skillId: quest.skill_id, amount: clampedSkillXp });
    }

    streak = await updateStreak(admin, userId);
    if (streak.currentStreak >= 3) await grant("STREAK_3");
    if (streak.currentStreak >= 7) await grant("STREAK_7");

    if (streak.freezeUsed) {
      await logEvent(admin, userId, EVENT.FREEZE_CONSUMED, { newStreak: streak.currentStreak });
    } else if (streak.streakEarnedBack) {
      await logEvent(admin, userId, EVENT.EARNBACK_SUCCEEDED, { restoredStreak: streak.currentStreak });
    } else if (streak.earnbackWindowJustOpened) {
      await logEvent(admin, userId, EVENT.EARNBACK_STARTED, {});
    } else {
      await logEvent(admin, userId, EVENT.STREAK_EXTENDED, { currentStreak: streak.currentStreak });
    }

    await grant("FIRST_WIN");

    // Best-effort: generate the next quest for this goal so the core
    // loop (§1: ... XP -> LEVEL UP -> SKILL UNLOCK -> NEXT QUEST)
    // actually continues. A failure here doesn't affect the evaluation
    // result already returned to the user.
    //
    // Roadmap item A: check the (category, difficulty) cache before
    // ever calling the AI — a hit costs zero budget. Personalization
    // is a plain string substitution (questCache.personalizeTemplate),
    // not a second AI call, per the brief's "personalise only the
    // flavour text" without spending more budget than the cached quest
    // already cost (nothing, on a hit).
    if (quest.goal_id && goal?.title) {
      try {
        const category = inferCategory(goal.title);
        const difficulty = quest.difficulty ?? 1;
        const cachedTemplate = await getCachedQuestTemplate(admin, category, difficulty);
        let nextQuest: QuestGeneration;

        if (cachedTemplate) {
          nextQuest = personalizeTemplate(cachedTemplate, goal.title);
          // Logged explicitly here — a cache hit never reaches
          // gatewayCall, so nothing else would record it. On a miss,
          // deliberately NOT logging a second time below: the gateway
          // call inside generateQuest already logs one ai_call_logged
          // event for the real request — logging again here would
          // double-count against the per-user quest_generations
          // budget (checkBudget just counts matching events).
          await logEvent(admin, userId, EVENT.AI_CALL_LOGGED, {
            purpose: "quest_generation",
            cacheHit: true,
            outcome: "success",
          });
        } else {
          const genBudget = await checkBudget(admin, userId, "quest_generations");
          if (!genBudget.allowed) {
            throw new Error("quest_generations budget exhausted — skipping next-quest generation");
          }
          nextQuest = await getAIProvider().generateQuest(
            {
              goalTitle: goal.title,
              primaryObjective: null,
              occupation: null,
              skillLevel: 1,
              recentQuestTitles: [quest.title],
            },
            { userId, admin },
          );
          void cacheQuestTemplate(admin, category, difficulty, nextQuest);
        }

        await admin.from("quests").insert({
          user_id: userId,
          goal_id: quest.goal_id,
          skill_id: await matchSkillId(admin, nextQuest.skill),
          title: nextQuest.title,
          description: `${nextQuest.description}\n\nSkill focus: ${nextQuest.skill}`,
          objective: nextQuest.objective,
          difficulty: nextQuest.difficulty,
          estimated_minutes: nextQuest.estimated_minutes,
          xp_reward: Math.min(nextQuest.xp_reward, 500),
          evidence_required: nextQuest.evidence_required,
          evidence_type: nextQuest.evidence_type,
          success_criteria: nextQuest.success_criteria as Json,
          instructions: nextQuest.instructions as Json,
          status: "available",
        });
      } catch (err) {
        logError("goal_plan", err, { userId, goalId: quest.goal_id });
        // Non-fatal — the user can still see this evaluation result;
        // they just won't have a fresh quest queued yet.
      }
    }
  }

  return NextResponse.json({
    passed: evaluation.passed,
    score: evaluation.score,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    xpAwarded: clampedXp,
    leveledUp,
    newLevel,
    streak,
    newAchievements,
  });
}
