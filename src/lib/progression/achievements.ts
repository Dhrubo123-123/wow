import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Grants an achievement by key, idempotently — the DB's
 * unique(user_id, achievement_id) constraint (Phase 2 migration) is the
 * actual enforcement; this just treats a conflict as a no-op success
 * instead of an error, so callers never need to check "has the user
 * already got this" themselves before calling.
 */
export async function unlockAchievement(
  admin: SupabaseClient<Database>,
  input: { userId: string; achievementKey: string },
): Promise<{ granted: boolean }> {
  const { data: achievement, error: lookupError } = await admin
    .from("achievements")
    .select("id")
    .eq("key", input.achievementKey)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`unlockAchievement: lookup failed: ${lookupError.message}`);
  }
  if (!achievement) {
    // Unknown key — likely a config table not seeded yet (Phase 17).
    // Don't throw: achievement granting should never break the caller's
    // main flow (e.g. quest evaluation).
    return { granted: false };
  }

  const { error: insertError } = await admin.from("user_achievements").insert({
    user_id: input.userId,
    achievement_id: achievement.id,
  });

  if (!insertError) return { granted: true };

  // Postgres unique_violation — the user already has this achievement.
  if (insertError.code === "23505") return { granted: false };

  throw new Error(`unlockAchievement: insert failed: ${insertError.message}`);
}
