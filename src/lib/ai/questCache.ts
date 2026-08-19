import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { QuestGeneration } from "./schemas";

export type QuestCategory = "fitness" | "cooking" | "learning" | "productivity" | "other";

const CATEGORY_KEYWORDS: Record<Exclude<QuestCategory, "other">, string[]> = {
  fitness: ["run", "gym", "workout", "exercise", "fitness", "weight", "strength", "cardio", "muscle"],
  cooking: ["cook", "chef", "recipe", "kitchen", "bake", "culinary", "food"],
  learning: ["learn", "study", "course", "language", "skill", "read", "book"],
  productivity: ["productiv", "work", "career", "business", "habit", "focus", "organiz"],
};

/** Crude keyword match — good enough to bucket goals for cache reuse,
 *  not a real classifier. Falls back to "other" rather than guessing. */
export function inferCategory(goalTitle: string): QuestCategory {
  const lower = goalTitle.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    Exclude<QuestCategory, "other">,
    string[],
  ][]) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "other";
}

/**
 * Caches quests by (category, difficulty, day_index) per roadmap item
 * A. Simplification worth flagging: `dayIndex` is always 0 here — the
 * evaluate route's "next quest" step doesn't currently track which day
 * of a goal a user is on, so this caches per (category, difficulty)
 * rather than the full 3-axis key the brief describes. Real day-index
 * tracking is a bigger change (needs a counter on `goals`) that didn't
 * fit this pass; flagged in the roadmap report, not hidden.
 */
export async function getCachedQuestTemplate(
  admin: SupabaseClient<Database>,
  category: QuestCategory,
  difficulty: number,
  dayIndex = 0,
): Promise<QuestGeneration | null> {
  const { data } = await admin
    .from("quest_template_cache")
    .select("template")
    .eq("category", category)
    .eq("difficulty", difficulty)
    .eq("day_index", dayIndex)
    .maybeSingle();

  return data ? (data.template as unknown as QuestGeneration) : null;
}

export async function cacheQuestTemplate(
  admin: SupabaseClient<Database>,
  category: QuestCategory,
  difficulty: number,
  template: QuestGeneration,
  dayIndex = 0,
): Promise<void> {
  await admin
    .from("quest_template_cache")
    .upsert(
      { category, difficulty, day_index: dayIndex, template: template as unknown as Json },
      { onConflict: "category,difficulty,day_index" },
    );
}

/**
 * Personalizes a cached template without a second AI call — a plain
 * string substitution, not a generation. Keeps the "personalise only
 * the one-line flavour text" goal without spending any more budget
 * than the single cached quest already cost (zero, on a cache hit).
 */
export function personalizeTemplate(template: QuestGeneration, goalTitle: string): QuestGeneration {
  return {
    ...template,
    description: `${template.description}\n\nIn service of your goal: ${goalTitle}.`,
  };
}
