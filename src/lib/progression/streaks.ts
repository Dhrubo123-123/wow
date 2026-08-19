import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { nextStreakState } from "./streakLogic";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

  const { data: existing } = await admin
    .from("streaks")
    .select(
      "current_streak, longest_streak, last_activity_date, freezes_available, last_streak_before_break, streak_break_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const result = nextStreakState(
    existing
      ? {
          currentStreak: existing.current_streak,
          longestStreak: existing.longest_streak,
          lastActivityDate: existing.last_activity_date,
          freezesAvailable: existing.freezes_available,
          lastStreakBeforeBreak: existing.last_streak_before_break,
          streakBreakExpiresAt: existing.streak_break_expires_at,
        }
      : null,
    today,
  );

  await admin.from("streaks").upsert(
    {
      user_id: userId,
      current_streak: result.currentStreak,
      longest_streak: result.longestStreak,
      last_activity_date: today,
      freezes_available: result.freezesAvailable,
      last_streak_before_break: result.lastStreakBeforeBreak,
      streak_break_expires_at: result.streakBreakExpiresAt,
    },
    { onConflict: "user_id" },
  );

  return {
    currentStreak: result.currentStreak,
    longestStreak: result.longestStreak,
    freezesAvailable: result.freezesAvailable,
    freezeUsed: result.freezeUsed,
    streakEarnedBack: result.streakEarnedBack,
    // Non-null here means a *new* earn-back window just opened this
    // update — distinct from streakEarnedBack (which means an
    // existing window was just successfully redeemed).
    earnbackWindowOpened: result.lastStreakBeforeBreak !== null,
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
    .update({ last_streak_before_break: null, streak_break_expires_at: null })
    .eq("user_id", userId);

  await logEvent(admin, userId, EVENT.EARNBACK_EXPIRED, {});
}
