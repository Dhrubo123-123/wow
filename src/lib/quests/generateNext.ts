import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getAIProvider, type QuestGeneration } from "@/lib/ai";
import { matchSkillId } from "./matchSkill";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkBudget } from "@/lib/ai/budget";
import { getCachedQuestTemplate, cacheQuestTemplate, inferCategory, personalizeTemplate } from "@/lib/ai/questCache";
import { fridayAdjustedMinutes } from "./fridayShortening";

/**
 * Shared "make the next quest for this goal" logic — extracted out of
 * evaluateQuest.ts (where it originally only ran right after a passed
 * evaluation) so roadmap item 3's expiry-refresh path
 * (lib/quests/today.ts) can call the exact same cache-first, budget-
 * respecting generation instead of a second copy that could drift.
 * Cache-hit generations are free; a real AI call still goes through
 * checkBudget first, same as every other roadmap-item-A call site.
 */
export async function generateNextQuest(
  admin: SupabaseClient<Database>,
  userId: string,
  goal: { id: string; title: string },
  previousQuestTitle: string,
  difficulty: number,
): Promise<{ id: string } | null> {
  try {
    const category = inferCategory(goal.title);
    const cachedTemplate = await getCachedQuestTemplate(admin, category, difficulty);
    let nextQuest: QuestGeneration;

    if (cachedTemplate) {
      nextQuest = personalizeTemplate(cachedTemplate, goal.title);
      await logEvent(admin, userId, EVENT.AI_CALL_LOGGED, {
        purpose: "quest_generation",
        cacheHit: true,
        outcome: "success",
      });
    } else {
      const genBudget = await checkBudget(admin, userId, "quest_generations");
      if (!genBudget.allowed) {
        throw new Error("quest_generations budget exhausted — skipping quest generation");
      }
      nextQuest = await getAIProvider().generateQuest(
        {
          goalTitle: goal.title,
          primaryObjective: null,
          occupation: null,
          skillLevel: 1,
          recentQuestTitles: [previousQuestTitle],
        },
        { userId, admin },
      );
      void cacheQuestTemplate(admin, category, difficulty, nextQuest);
    }

    const { data: inserted, error } = await admin
      .from("quests")
      .insert({
        user_id: userId,
        goal_id: goal.id,
        skill_id: await matchSkillId(admin, nextQuest.skill),
        title: nextQuest.title,
        description: `${nextQuest.description}\n\nSkill focus: ${nextQuest.skill}`,
        objective: nextQuest.objective,
        difficulty: nextQuest.difficulty,
        // Roadmap item 6 — Friday quests are shorter, a small kindness
        // heading into the weekend.
        estimated_minutes: fridayAdjustedMinutes(nextQuest.estimated_minutes, new Date()),
        xp_reward: Math.min(nextQuest.xp_reward, 500),
        evidence_required: nextQuest.evidence_required,
        evidence_type: nextQuest.evidence_type,
        success_criteria: nextQuest.success_criteria as Json,
        instructions: nextQuest.instructions as Json,
        status: "available",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      logError("quest_generation", error, { userId, goalId: goal.id });
      return null;
    }
    return inserted;
  } catch (err) {
    logError("quest_generation", err, { userId, goalId: goal.id });
    return null;
  }
}
