/**
 * Roadmap item 5 — variable XP on top of the base evaluation award.
 * Pure and unit-testable (same split as streakLogic.ts/flame.ts):
 * randomness (crit rolls) is injected as a `roll` parameter rather than
 * called internally, so tests can pin outcomes instead of mocking Math.random.
 *
 * Everything here only ever produces a BONUS layered on top of the
 * existing clamped base XP (evaluateQuest.ts's `clampedXp`, itself
 * already ceilinged at quest.xp_reward) — it never raises that base
 * ceiling. "AI must not be allowed to award unlimited XP" (brief
 * §14/§22) still holds; this just makes a good showing feel rewarded
 * beyond the flat number.
 */

export type XPTier = "bronze" | "silver" | "gold";

const TIER_BONUS_RATE: Record<XPTier, number> = {
  bronze: 0,
  silver: 0.1,
  gold: 0.2,
};
const TIER_BONUS_CAP = 40; // absolute ceiling regardless of quest size

export function xpTierForScore(score: number): XPTier {
  if (score >= 90) return "gold";
  if (score >= 75) return "silver";
  return "bronze";
}

/** Tier bonus, computed from the (already-clamped) base award. */
export function tierBonusXp(baseXp: number, tier: XPTier): number {
  return Math.min(TIER_BONUS_CAP, Math.round(baseXp * TIER_BONUS_RATE[tier]));
}

const CRIT_CHANCE = 0.12; // ~1 in 8 — frequent enough to feel real, not the headline mechanic
const CRIT_BONUS = 25;

/** `roll` is a [0, 1) random value — inject Math.random() at the call site. */
export function isCriticalHit(roll: number): boolean {
  return roll < CRIT_CHANCE;
}

export const CRIT_BONUS_XP = CRIT_BONUS;

// Streak lengths that land a one-time flat milestone bonus the day they're hit.
const STREAK_MILESTONES: Record<number, number> = {
  7: 50,
  30: 150,
  100: 500,
};

/** 0 unless `streakDays` is exactly a milestone day. */
export function streakMilestoneBonusXp(streakDays: number): number {
  return STREAK_MILESTONES[streakDays] ?? 0;
}
