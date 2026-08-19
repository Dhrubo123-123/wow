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
 *
 * Roadmap item 1: earn-back now requires TWO redemptions (genuine
 * quest completions) within the window, not one — "slightly more than
 * a normal day" per the brief, so it reads as earned rather than a
 * second free freeze. Deliberately NOT a special AI-generated "bonus
 * quest" — that would add a fresh AI call per earn-back right when
 * roadmap item A exists specifically to protect the AI budget; any two
 * real quest completions count, which is both simpler and free.
 */

const FREEZE_CAP = 2; // "aim for the average user to have 1-2 freezes at any time"
const REPLENISH_EVERY_DAYS = 7; // sustained week-long streaks earn a freeze back
const EARN_BACK_WINDOW_DAYS = 2; // Duolingo-style short grace window to regain a broken streak
const EARNBACK_REQUIRED_REDEMPTIONS = 2; // "today's quest plus one more" — earned, not free

export interface StreakRecord {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // YYYY-MM-DD
  freezesAvailable: number;
  lastStreakBeforeBreak: number | null;
  streakBreakExpiresAt: string | null; // YYYY-MM-DD, inclusive
  earnbackRedemptions: number;
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  freezesAvailable: number;
  lastStreakBeforeBreak: number | null;
  streakBreakExpiresAt: string | null;
  earnbackRedemptions: number;
  /** UI/narration hook: a freeze silently bridged a missed day this update. */
  freezeUsed: boolean;
  /** UI/narration hook: a previously-broken streak was just restored. */
  streakEarnedBack: boolean;
}

export type StreakRiskLevel = "safe" | "freeze-will-cover" | "at-risk" | "earnback-in-progress";

export interface StreakRiskInfo {
  level: StreakRiskLevel;
  /** Empty string when level is "safe" — nothing worth showing. */
  message: string;
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
  earnbackRedemptions: existing.earnbackRedemptions,
  freezeUsed: false,
  streakEarnedBack: false,
});

function isEarnbackActive(existing: StreakRecord, today: string): boolean {
  return (
    existing.lastStreakBeforeBreak !== null &&
    existing.streakBreakExpiresAt !== null &&
    today <= existing.streakBreakExpiresAt
  );
}

/**
 * - same day as last activity → no change (one completion doesn't count twice),
 *   UNLESS an earn-back window is active, where every completion counts
 *   toward redemption even same-day (someone can do both quests in one sitting)
 * - an open earn-back window → this completion counts as one redemption;
 *   the streak is restored once EARNBACK_REQUIRED_REDEMPTIONS is reached
 * - exactly one day later (no earn-back active) → streak continues (+1)
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
      earnbackRedemptions: 0,
      freezeUsed: false,
      streakEarnedBack: false,
    };
  }

  if (isEarnbackActive(existing, today)) {
    const redemptions = existing.earnbackRedemptions + 1;
    if (redemptions >= EARNBACK_REQUIRED_REDEMPTIONS) {
      const restored = existing.lastStreakBeforeBreak! + 1;
      return {
        currentStreak: restored,
        longestStreak: Math.max(restored, existing.longestStreak),
        freezesAvailable: replenishFreeze(restored, existing.freezesAvailable),
        lastStreakBeforeBreak: null,
        streakBreakExpiresAt: null,
        earnbackRedemptions: 0,
        freezeUsed: false,
        streakEarnedBack: true,
      };
    }
    // First redemption of two — streak stays at 1, progress is tracked
    // but nothing is restored (and nothing is falsely reported as
    // "extended") until the second one lands.
    return {
      currentStreak: 1,
      longestStreak: existing.longestStreak,
      freezesAvailable: existing.freezesAvailable,
      lastStreakBeforeBreak: existing.lastStreakBeforeBreak,
      streakBreakExpiresAt: existing.streakBreakExpiresAt,
      earnbackRedemptions: redemptions,
      freezeUsed: false,
      streakEarnedBack: false,
    };
  }

  const gap = daysBetween(existing.lastActivityDate, today);
  if (gap === 0) return noChange(existing);

  if (gap === 1) {
    const next = existing.currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(next, existing.longestStreak),
      freezesAvailable: replenishFreeze(next, existing.freezesAvailable),
      lastStreakBeforeBreak: null,
      streakBreakExpiresAt: null,
      earnbackRedemptions: 0,
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
      earnbackRedemptions: 0,
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
    earnbackRedemptions: 0,
    freezeUsed: false,
    streakEarnedBack: false,
  };
}

/**
 * Forward-looking prediction (no side effects, no persistence) of
 * whether "today" is at risk — the fix for "never let a user discover
 * retroactively that a freeze was spent." This is read BEFORE the
 * streak actually changes (dashboard render, any future reminder), so
 * a freeze that's *about to* cover a gap is surfaced the same day
 * instead of appearing as a surprise toast once the next quest is
 * eventually completed.
 */
export function describeStreakRisk(existing: StreakRecord | null, today: string): StreakRiskInfo {
  if (!existing?.lastActivityDate) return { level: "safe", message: "" };

  if (isEarnbackActive(existing, today)) {
    const remaining = EARNBACK_REQUIRED_REDEMPTIONS - existing.earnbackRedemptions;
    return {
      level: "earnback-in-progress",
      message:
        remaining <= 1
          ? "One more quest earns your streak back!"
          : `Complete ${remaining} quests to earn your ${existing.lastStreakBeforeBreak}-day streak back.`,
    };
  }

  const gap = daysBetween(existing.lastActivityDate, today);
  if (gap <= 0) return { level: "safe", message: "" }; // already active today

  if (gap === 1) {
    // Haven't done anything today yet, but yesterday was fine — this
    // is the normal "do today's quest" state, not yet at risk.
    return { level: "safe", message: "" };
  }

  if (gap === 2) {
    // One full day already missed — today decides it.
    if (existing.freezesAvailable > 0) {
      return {
        level: "freeze-will-cover",
        message: "❄️ Your freeze is covering today — finish a quest to keep the streak alive.",
      };
    }
    return {
      level: "at-risk",
      message: `Your ${existing.currentStreak}-day streak needs today's quest — no freeze available.`,
    };
  }

  // gap >= 3: past saving for today specifically (a freeze only ever
  // bridges one day) — nothing more urgent to say than the normal
  // "start again" framing already on the Today screen.
  return { level: "safe", message: "" };
}
