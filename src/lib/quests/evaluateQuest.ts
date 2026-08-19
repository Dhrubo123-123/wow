import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getAIProvider, AIProviderError } from "@/lib/ai";
import { awardXP, updateSkillXP, updateStreak, unlockAchievement } from "@/lib/progression";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { generateNextQuest } from "./generateNext";

// Server-enforced ceiling — the AI's proposal is never trusted outright
// (brief §14/§22: "AI must not be allowed to award unlimited XP").
const MAX_SKILL_XP = 100;

export interface QuestEvaluationResult {
  passed: boolean;
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  // Roadmap item 3 — the ceremony's one concrete, specific line naming
  // something the GM actually saw/read, not generic praise.
  observedDetail: string;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number | null;
  streak: Awaited<ReturnType<typeof updateStreak>> | null;
  newAchievements: { key: string; name: string; description: string | null }[];
}

/**
 * The actual "call the Game Master and close the core loop" logic —
 * extracted out of the evaluate route (roadmap item A3) so it can run
 * from two places with identical behavior:
 *   1. `POST /api/quests/[id]/evaluate` — the normal synchronous path,
 *      right after a user submits evidence.
 *   2. `GET /api/jobs/process-evaluations` (Vercel Cron, once daily (Vercel Hobby plan limit))
 *      — sweeps any quest left sitting in `submitted` past a grace
 *      window, which is what actually makes roadmap item A's
 *      "graceful degradation" real instead of just an honest message:
 *      a degraded evaluation gets a genuine second attempt here, not
 *      just a promise.
 *
 * Uses the ADMIN client throughout (not a user-scoped session — the
 * cron job has no session at all), so the caller is responsible for
 * having already confirmed `questId` really belongs to `userId`
 * before calling this (the route does via its own RLS-scoped fetch
 * first; the cron job's query itself filters by quests.user_id).
 */
export async function runQuestEvaluation(
  admin: SupabaseClient<Database>,
  questId: string,
  userId: string,
): Promise<QuestEvaluationResult> {
  const { data: quest, error: questError } = await admin
    .from("quests")
    .select("id, user_id, goal_id, skill_id, title, objective, success_criteria, xp_reward, status, difficulty")
    .eq("id", questId)
    .eq("user_id", userId)
    .single();

  if (questError || !quest) {
    throw new AIProviderError("Quest not found for evaluation", questError);
  }

  const { data: attempt } = await admin
    .from("quest_attempts")
    .select("id, status")
    .eq("quest_id", questId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!attempt) {
    throw new AIProviderError("No submitted attempt found for evaluation");
  }

  const { data: evidence } = await admin
    .from("quest_evidence")
    .select("evidence_type, content")
    .eq("quest_attempt_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: goal } = quest.goal_id
    ? await admin.from("goals").select("title").eq("id", quest.goal_id).single()
    : { data: null };

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
    // Roll back to `submitted` — never strand it in `under_review`.
    // For the cron path this just means the next sweep tries again.
    await admin.from("quests").update({ status: "submitted" }).eq("id", questId);
    throw err;
  }

  const clampedXp = Math.max(0, Math.min(evaluation.xp_awarded, quest.xp_reward));
  const clampedSkillXp = Math.max(0, Math.min(evaluation.skill_xp_awarded, MAX_SKILL_XP));

  await logEvent(admin, userId, EVENT.EVALUATION_RETURNED, {
    questId,
    passed: evaluation.passed,
    score: evaluation.score,
    xpAwarded: clampedXp,
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
    throw new AIProviderError("Failed to store evaluation", evalInsertError);
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

  await grant("FIRST_QUEST");

  if (evaluation.passed) {
    if (clampedXp > 0) {
      const xpResult = await awardXP(admin, {
        userId,
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
      await updateSkillXP(admin, { userId, skillId: quest.skill_id, amount: clampedSkillXp });
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

    if (quest.goal_id && goal?.title) {
      // Roadmap item 3 — "next quest revealed after every evaluation".
      // Shared with the expiry-refresh path (lib/quests/today.ts) so
      // there's exactly one implementation of "make the next quest".
      await generateNextQuest(admin, userId, { id: quest.goal_id, title: goal.title }, quest.title, quest.difficulty ?? 1);
    }
  }

  return {
    passed: evaluation.passed,
    score: evaluation.score,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    observedDetail: evaluation.observed_detail,
    xpAwarded: clampedXp,
    leveledUp,
    newLevel,
    streak,
    newAchievements,
  };
}
