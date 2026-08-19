/**
 * Roadmap item 4 — the streak flame escalates in look, not just in
 * number, so a 60-day streak *reads* as a bigger deal than a 3-day one
 * at a glance. Pure and unit-testable, same reasoning as streakLogic.ts.
 */

export interface FlameTier {
  emoji: string;
  label: string;
  /** CSS classes to layer onto the flame span — escalates with the streak. */
  className: string;
}

const TIERS: Array<{ minDays: number; tier: FlameTier }> = [
  { minDays: 0, tier: { emoji: "🕯️", label: "No streak yet", className: "" } },
  { minDays: 1, tier: { emoji: "🔥", label: "Spark", className: "animate-flame-flicker" } },
  { minDays: 7, tier: { emoji: "🔥🔥", label: "Fire", className: "animate-flame-flicker" } },
  { minDays: 14, tier: { emoji: "🔥🔥🔥", label: "Blaze", className: "animate-flame-flicker" } },
  {
    minDays: 30,
    tier: { emoji: "🔥🔥🔥", label: "Inferno", className: "animate-flame-flicker animate-glow-pulse" },
  },
  {
    minDays: 100,
    tier: { emoji: "🔥🔥🔥", label: "Eternal Flame", className: "animate-flame-flicker animate-glow-pulse" },
  },
];

export function getFlameTier(streakDays: number): FlameTier {
  let current = TIERS[0].tier;
  for (const { minDays, tier } of TIERS) {
    if (streakDays >= minDays) current = tier;
  }
  return current;
}
