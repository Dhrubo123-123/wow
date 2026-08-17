import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, XPSourceType } from "@/lib/supabase/types";
import { calculateLevel } from "./levels";

export interface AwardXPInput {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  skillId?: string;
}

export interface AwardXPResult {
  totalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

/**
 * Records an XP award and updates the user's cached level/xp.
 *
 * Must be called with an admin (service-role) client — xp_transactions
 * has no insert policy for regular users by design (Phase 2), and the
 * caller (Phase 14's evaluation endpoint) is responsible for clamping
 * `amount` against a server-defined maximum *before* calling this. This
 * function does not itself second-guess the amount; it just records and
 * applies it atomically-enough for an MVP (two sequential writes, not a
 * DB transaction — acceptable since xp_transactions is the source of
 * truth and profiles.xp/level are a derived cache that can be
 * recomputed from the ledger if they ever drift).
 */
export async function awardXP(
  admin: SupabaseClient<Database>,
  input: AwardXPInput,
): Promise<AwardXPResult> {
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("awardXP: amount must be a non-zero finite number");
  }

  const { data: profile, error: profileFetchError } = await admin
    .from("profiles")
    .select("xp, level")
    .eq("id", input.userId)
    .single();

  if (profileFetchError || !profile) {
    throw new Error(`awardXP: could not load profile for ${input.userId}`);
  }

  const { error: txError } = await admin.from("xp_transactions").insert({
    user_id: input.userId,
    amount: input.amount,
    source_type: input.sourceType,
    source_id: input.sourceId ?? null,
    skill_id: input.skillId ?? null,
  });

  if (txError) {
    throw new Error(`awardXP: failed to write ledger entry: ${txError.message}`);
  }

  const previousLevel = profile.level;
  const totalXp = Math.max(0, profile.xp + input.amount);
  const newLevel = calculateLevel(totalXp);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ xp: totalXp, level: newLevel })
    .eq("id", input.userId);

  if (updateError) {
    // The ledger entry is already written and remains the source of
    // truth; the cached profile.xp/level can be reconciled from it.
    throw new Error(`awardXP: failed to update profile cache: ${updateError.message}`);
  }

  return {
    totalXp,
    previousLevel,
    newLevel,
    leveledUp: newLevel > previousLevel,
  };
}
