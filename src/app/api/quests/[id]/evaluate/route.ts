import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIProviderError } from "@/lib/ai";
import { awardXP, updateSkillXP, updateStreak, unlockAchievement } from "@/lib/progression";
import { matchSkillId } from "@/lib/quests";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import type { Json } from "@/lib/supabase/types";

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
    .select("id, user_id, goal_id, skill_id, title, objective, success_criteria, xp_reward, status")
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

  // Mark evaluation as in-flight (submitted -> under_review), matching
  // the lifecycle graph in lib/quests/transitions.ts.
  await admin.from("quests").update({ status: "under_review" }).eq("id", questId);

  let evaluation;
  try {
    evaluation = await getAIProvider().evaluateQuest({
      questTitle: quest.title,
      questObjective: quest.objective,
      successCriteria: (quest.success_criteria as string[] | null) ?? [],
      evidenceType: evidence?.evidence_type ?? "text",
      evidenceSummary: evidence?.content ?? "(no description provided)",
      goalTitle: goal?.title ?? "General self-improvement",
    });
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
    } else if (streak.earnbackWindowOpened) {
      await logEvent(admin, userId, EVENT.EARNBACK_STARTED, {});
    } else {
      await logEvent(admin, userId, EVENT.STREAK_EXTENDED, { currentStreak: streak.currentStreak });
    }

    await grant("FIRST_WIN");

    // Best-effort: generate the next quest for this goal so the core
    // loop (§1: ... XP -> LEVEL UP -> SKILL UNLOCK -> NEXT QUEST)
    // actually continues. A failure here doesn't affect the evaluation
    // result already returned to the user.
    if (quest.goal_id && goal?.title) {
      try {
        const nextQuest = await getAIProvider().generateQuest({
          goalTitle: goal.title,
          primaryObjective: null,
          occupation: null,
          skillLevel: 1,
          recentQuestTitles: [quest.title],
        });
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
