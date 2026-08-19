import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { nextStreakState, describeStreakRisk, type StreakRecord } from "./streakLogic";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function loadStreakRecord(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<StreakRecord | null> {
  const { data } = await admin
    .from("streaks")
    .select(
      "current_streak, longest_streak, last_activity_date, freezes_available, last_streak_before_break, streak_break_expires_at, earnback_redemptions",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    currentStreak: data.current_streak,
    longestStreak: data.longest_streak,
    lastActivityDate: data.last_activity_date,
    freezesAvailable: data.freezes_available,
    lastStreakBeforeBreak: data.last_streak_before_break,
    streakBreakExpiresAt: data.streak_break_expires_at,
    earnbackRedemptions: data.earnback_redemptions,
  };
}

/**
 * Deterministic streak update, called once per *passed* quest
 * evaluation (Phase 14). No AI involved — see streakLogic.ts's
 * nextStreakState for the actual rule (kept pure/testable there).
 *
 * Post-launch: also carries streak freezes and the earn-back window
 * through to/from the DB — freezeUsed/streakEarnedBack are surfaced
 * to the caller so the evaluate route can tell the user what actually
 * happened (a silent freeze-save or a restored streak reads as a bug
 * if it isn't explained).
 */
export async function updateStreak(admin: SupabaseClient<Database>, userId: string) {
  const today = todayUTC();
  const existing = await loadStreakRecord(admin, userId);
  const result = nextStreakState(existing, today);

  await admin.from("streaks").upsert(
    {
      user_id: userId,
      current_streak: result.currentStreak,
      longest_streak: result.longestStreak,
      last_activity_date: today,
      freezes_available: result.freezesAvailable,
      last_streak_before_break: result.lastStreakBeforeBreak,
      streak_break_expires_at: result.streakBreakExpiresAt,
      earnback_redemptions: result.earnbackRedemptions,
    },
    { onConflict: "user_id" },
  );

  return {
    currentStreak: result.currentStreak,
    longestStreak: result.longestStreak,
    freezesAvailable: result.freezesAvailable,
    freezeUsed: result.freezeUsed,
    streakEarnedBack: result.streakEarnedBack,
    // True only the update a *new* earn-back window opens — distinct
    // from "a window is open and this was a mid-progress redemption",
    // which would otherwise re-fire "started" on every partial
    // redemption too.
    earnbackWindowJustOpened:
      (existing?.lastStreakBeforeBreak ?? null) === null && result.lastStreakBeforeBreak !== null,
  };
}

/**
 * Streak updates only run when a quest is *completed* — so an
 * earn-back window that the user simply never redeems has no natural
 * moment to notice it expired. Called lazily from the dashboard's own
 * read path instead of a cron job: cheap, no infra, and correct within
 * one page load of the window actually closing (a day or two of lag
 * on the analytics event is fine for this — it's a metric, not a
 * user-facing consequence).
 */
export async function expireEarnbackIfPast(admin: SupabaseClient<Database>, userId: string) {
  const today = todayUTC();

  const { data: existing } = await admin
    .from("streaks")
    .select("last_streak_before_break, streak_break_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing?.last_streak_before_break || !existing.streak_break_expires_at) return;
  if (existing.streak_break_expires_at >= today) return; // still valid

  await admin
    .from("streaks")
    .update({ last_streak_before_break: null, streak_break_expires_at: null, earnback_redemptions: 0 })
    .eq("user_id", userId);

  await logEvent(admin, userId, EVENT.EARNBACK_EXPIRED, {});
}

/**
 * Read-only risk prediction for the Today screen (and, later, any
 * reminder) — never mutates anything. See streakLogic.ts's
 * describeStreakRisk for the actual rule.
 */
export async function getStreakRisk(admin: SupabaseClient<Database>, userId: string) {
  const today = todayUTC();
  const existing = await loadStreakRecord(admin, userId);
  return describeStreakRisk(existing, today);
}
