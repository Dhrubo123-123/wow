import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(b) - Date.parse(a)) / msPerDay);
}

/**
 * Deterministic streak update, called once per *passed* quest
 * evaluation (Phase 14). No AI involved:
 * - same day as last activity → no change (one completion doesn't count twice)
 * - exactly one day later → streak continues (+1)
 * - any bigger gap (or first-ever activity) → streak resets to 1
 */
export async function updateStreak(admin: SupabaseClient<Database>, userId: string) {
  const today = todayUTC();

  const { data: existing } = await admin
    .from("streaks")
    .select("current_streak, longest_streak, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();

  let currentStreak = 1;

  if (existing?.last_activity_date) {
    const gap = daysBetween(existing.last_activity_date, today);
    if (gap === 0) currentStreak = existing.current_streak;
    else if (gap === 1) currentStreak = existing.current_streak + 1;
    else currentStreak = 1;
  }

  const longestStreak = Math.max(currentStreak, existing?.longest_streak ?? 0);

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
