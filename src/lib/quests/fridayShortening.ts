/**
 * Roadmap item 6 — Friday quests are shorter. Pure so it's testable
 * without mocking the clock through a whole generation call.
 */

export const FRIDAY_MAX_MINUTES = 10;

export function isFriday(now: Date): boolean {
  return now.getUTCDay() === 5;
}

/** Caps estimated_minutes on Fridays; passes through unchanged any other day. */
export function fridayAdjustedMinutes(estimatedMinutes: number, now: Date): number {
  return isFriday(now) ? Math.min(estimatedMinutes, FRIDAY_MAX_MINUTES) : estimatedMinutes;
}
