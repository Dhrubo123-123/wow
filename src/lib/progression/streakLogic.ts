/**
 * Pure streak decision logic — no Date.now(), no DB, no "server-only"
 * guard — split out from streaks.ts specifically so Phase 23's unit
 * tests can import it directly instead of mocking Supabase + system
 * time (streaks.ts itself is server-only and touches the DB).
 */

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(b) - Date.parse(a)) / msPerDay);
}

/**
 * - same day as last activity → no change (one completion doesn't count twice)
 * - exactly one day later → streak continues (+1)
 * - any bigger gap (or first-ever activity) → streak resets to 1
 */
export function nextStreakState(
  existing: { currentStreak: number; longestStreak: number; lastActivityDate: string | null } | null,
  today: string,
): StreakState {
  let currentStreak = 1;

  if (existing?.lastActivityDate) {
    const gap = daysBetween(existing.lastActivityDate, today);
    if (gap === 0) currentStreak = existing.currentStreak;
    else if (gap === 1) currentStreak = existing.currentStreak + 1;
    else currentStreak = 1;
  }

  const longestStreak = Math.max(currentStreak, existing?.longestStreak ?? 0);
  return { currentStreak, longestStreak };
}
