/**
 * Pure streak decision logic — no Date.now(), no DB, no "server-only"
 * guard — split out from streaks.ts specifically so unit tests can
 * import it directly instead of mocking Supabase + system time
 * (streaks.ts itself is server-only and touches the DB).
 *
 * Post-launch retention pass: adds streak freezes and an "earn it
 * back" window, backed by research the user brought back — apps with
 * streak freezes see meaningfully longer average streaks than apps
 * without, and Duolingo's own data shows letting users regain a
 * recently-broken streak (rather than just resetting to 1) increases
 * retention. Deliberately still additive-only: nothing here removes
 * XP or levels, matching the brief's original "no punishment" design
 * and the research finding that punishment-based mechanics correlate
 * with worse long-term retention (Habitica's HP-loss system was the
 * cited cautionary example).
 */

const FREEZE_CAP = 2; // "aim for the average user to have 1-2 freezes at any time"
const REPLENISH_EVERY_DAYS = 7; // sustained week-long streaks earn a freeze back
const EARN_BACK_WINDOW_DAYS = 2; // Duolingo-style short grace window to regain a broken streak

export interface StreakRecord {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // YYYY-MM-DD
  freezesAvailable: number;
  lastStreakBeforeBreak: number | null;
  streakBreakExpiresAt: string | null; // YYYY-MM-DD, inclusive
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  freezesAvailable: number;
  lastStreakBeforeBreak: number | null;
  streakBreakExpiresAt: string | null;
  /** UI/narration hook: a freeze silently bridged a missed day this update. */
  freezeUsed: boolean;
  /** UI/narration hook: a previously-broken streak was just restored. */
  streakEarnedBack: boolean;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(b) - Date.parse(a)) / msPerDay);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function replenishFreeze(next: number, freezesAvailable: number): number {
  if (next > 0 && next % REPLENISH_EVERY_DAYS === 0) {
    return Math.min(FREEZE_CAP, freezesAvailable + 1);
  }
  return freezesAvailable;
}

const noChange = (existing: StreakRecord): StreakUpdateResult => ({
  currentStreak: existing.currentStreak,
  longestStreak: existing.longestStreak,
  freezesAvailable: existing.freezesAvailable,
  lastStreakBeforeBreak: existing.lastStreakBeforeBreak,
  streakBreakExpiresAt: existing.streakBreakExpiresAt,
  freezeUsed: false,
  streakEarnedBack: false,
});

/**
 * - same day as last activity → no change (one completion doesn't count twice)
 * - exactly one day later → streak continues (+1)
 * - a broken streak still inside its earn-back window → restored (+1 on the old value)
 * - exactly one missed day, with a freeze available → freeze spent, streak continues (+1)
 * - any bigger/unbridgeable gap → streak resets to 1, opens a new earn-back window
 *   if the broken streak was worth restoring (>=2)
 */
export function nextStreakState(existing: StreakRecord | null, today: string): StreakUpdateResult {
  if (!existing?.lastActivityDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, existing?.longestStreak ?? 0),
      freezesAvailable: existing?.freezesAvailable ?? 1,
      lastStreakBeforeBreak: null,
      streakBreakExpiresAt: null,
      freezeUsed: false,
      streakEarnedBack: false,
    };
  }

  const gap = daysBetween(existing.lastActivityDate, today);
  if (gap === 0) return noChange(existing);

  // A broken streak within its grace window gets restored, not just resumed at 1.
  if (
    existing.lastStreakBeforeBreak !== null &&
    existing.streakBreakExpiresAt !== null &&
    today <= existing.streakBreakExpiresAt
  ) {
    const restored = existing.lastStreakBeforeBreak + 1;
    return {
      currentStreak: restored,
      longestStreak: Math.max(restored, existing.longestStreak),
      freezesAvailable: replenishFreeze(restored, existing.freezesAvailable),
      lastStreakBeforeBreak: null,
      streakBreakExpiresAt: null,
      freezeUsed: false,
      streakEarnedBack: true,
    };
  }

  if (gap === 1) {
    const next = existing.currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(next, existing.longestStreak),
      freezesAvailable: replenishFreeze(next, existing.freezesAvailable),
      lastStreakBeforeBreak: null,
      streakBreakExpiresAt: null,
      freezeUsed: false,
      streakEarnedBack: false,
    };
  }

  if (gap === 2 && existing.freezesAvailable > 0) {
    // Exactly one missed day, and a freeze can bridge it — the streak
    // continues as though the gap were 1, silently (freezeUsed tells
    // the caller to surface that so it doesn't look like a bug).
    const next = existing.currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(next, existing.longestStreak),
      freezesAvailable: existing.freezesAvailable - 1,
      lastStreakBeforeBreak: null,
      streakBreakExpiresAt: null,
      freezeUsed: true,
      streakEarnedBack: false,
    };
  }

  // A genuine break. Still additive: no XP/level penalty, ever — only
  // the streak counter resets. A meaningful streak (>=2) leaves a
  // short earn-back window open rather than just vanishing.
  const worthRestoring = existing.currentStreak >= 2;
  return {
    currentStreak: 1,
    longestStreak: existing.longestStreak,
    freezesAvailable: existing.freezesAvailable,
    lastStreakBeforeBreak: worthRestoring ? existing.currentStreak : null,
    streakBreakExpiresAt: worthRestoring ? addDays(today, EARN_BACK_WINDOW_DAYS) : null,
    freezeUsed: false,
    streakEarnedBack: false,
  };
}
