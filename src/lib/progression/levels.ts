/**
 * Deterministic level/XP math — no AI, no randomness, no DB access.
 * The AI proposes XP awards (Phase 14); this module is the sole source of
 * truth for what a given amount of XP means in level terms, and the
 * server clamps AI-proposed amounts using it.
 *
 * Curve: level N requires progressively more XP than N-1, growing
 * quadratically so early levels feel fast and later ones feel earned.
 */

const BASE_XP = 100;
const GROWTH_PER_LEVEL = 50;

/** XP required to go from `level` to `level + 1`. */
export function calculateXPForLevel(level: number): number {
  if (level < 1) throw new Error("level must be >= 1");
  return BASE_XP + (level - 1) * GROWTH_PER_LEVEL;
}

/** Total cumulative XP required to *reach* `level` (level 1 = 0 XP). */
export function calculateTotalXPForLevel(level: number): number {
  if (level < 1) throw new Error("level must be >= 1");
  let total = 0;
  for (let l = 1; l < level; l++) total += calculateXPForLevel(l);
  return total;
}

/** Derive the level implied by a total lifetime XP figure. */
export function calculateLevel(totalXp: number): number {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (remaining >= calculateXPForLevel(level)) {
    remaining -= calculateXPForLevel(level);
    level += 1;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpNeeded: number;
  progressPct: number;
}

/** Full breakdown of where `totalXp` sits within its current level. */
export function calculateProgress(totalXp: number): LevelProgress {
  const level = calculateLevel(totalXp);
  const xpIntoLevel = totalXp - calculateTotalXPForLevel(level);
  const xpNeeded = calculateXPForLevel(level);
  return {
    level,
    xpIntoLevel,
    xpNeeded,
    progressPct: Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)),
  };
}

/**
 * Convenience for UI call sites that already know the stored level (from
 * `profiles.level`) and just need the in-level progress bar numbers,
 * without recomputing calculateLevel from scratch.
 */
export function xpForNextLevel(
  totalXp: number,
  knownLevel: number,
): { xpIntoLevel: number; xpNeeded: number } {
  const xpIntoLevel = totalXp - calculateTotalXPForLevel(knownLevel);
  const xpNeeded = calculateXPForLevel(knownLevel);
  return { xpIntoLevel, xpNeeded };
}
