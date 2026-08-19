import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { nextStreakState } from "./streakLogic";

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
  };
}
