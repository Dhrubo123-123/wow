import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const MASTERY_XP_PER_LEVEL = 200;

/**
 * Adds skill-specific XP (separate from the account-level XP ledger) and
 * recomputes that skill's mastery_level. Upserts the user_skills row —
 * unlocked_at is stamped the first time a user earns XP in a skill.
 */
export async function updateSkillXP(
  admin: SupabaseClient<Database>,
  input: { userId: string; skillId: string; amount: number },
) {
  const { data: existing } = await admin
    .from("user_skills")
    .select("xp, unlocked_at")
    .eq("user_id", input.userId)
    .eq("skill_id", input.skillId)
    .maybeSingle();

  const newXp = Math.max(0, (existing?.xp ?? 0) + input.amount);
  const masteryLevel = Math.floor(newXp / MASTERY_XP_PER_LEVEL);

  const { error } = await admin.from("user_skills").upsert(
    {
      user_id: input.userId,
      skill_id: input.skillId,
      xp: newXp,
      mastery_level: masteryLevel,
      unlocked_at: existing?.unlocked_at ?? new Date().toISOString(),
    },
    { onConflict: "user_id,skill_id" },
  );

  if (error) {
    throw new Error(`updateSkillXP: ${error.message}`);
  }

  return { xp: newXp, masteryLevel };
}
