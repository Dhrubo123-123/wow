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
 */
export async function updateStreak(admin: SupabaseClient<Database>, userId: string) {
  const today = todayUTC();

  const { data: existing } = await admin
    .from("streaks")
    .select("current_streak, longest_streak, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();

  const { currentStreak, longestStreak } = nextStreakState(
    existing
      ? {
          currentStreak: existing.current_streak,
          longestStreak: existing.longest_streak,
          lastActivityDate: existing.last_activity_date,
        }
      : null,
    today,
  );

  await admin.from("streaks").upsert(
    {
      user_id: userId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_activity_date: today,
    },
    { onConflict: "user_id" },
  );

  return { currentStreak, longestStreak };
}
