import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { MentorContext } from "./types";

/**
 * Compact context builder for the AI Mentor (brief §26/Phase 18):
 * "Do NOT send the entire database blindly." Pulls only what a mentor
 * actually needs — a handful of recent quest titles, not full
 * descriptions/instructions/evidence — and nothing from other users.
 * Works with any RLS-scoped client (the caller's own session is
 * sufficient; no admin/service-role access needed here).
 */
export async function buildMentorContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  question: string,
): Promise<MentorContext> {
  const [{ data: profile }, { data: recentQuests }, { data: userAchievements }] = await Promise.all([
    supabase.from("profiles").select("name, level, xp, current_goal_id").eq("id", userId).single(),
    supabase
      .from("quests")
      .select("title, status")
      .eq("user_id", userId)
      .in("status", ["completed", "failed"])
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false })
      .limit(3),
  ]);

  const { data: goal } = profile?.current_goal_id
    ? await supabase.from("goals").select("title").eq("id", profile.current_goal_id).single()
    : { data: null };

  // No FK-relationship metadata in our hand-written Database types
  // (Relationships: [] on every table — see lib/supabase/types.ts), so
  // an embedded `select("achievements(name)")` can't be typed; a second
  // small query is simpler than fighting that with casts.
  const achievementIds = (userAchievements ?? []).map((a) => a.achievement_id);
  const { data: achievementRows } = achievementIds.length
    ? await supabase.from("achievements").select("name").in("id", achievementIds)
    : { data: [] };

  const recentQuestTitles = (recentQuests ?? [])
    .filter((q) => q.status === "completed")
    .slice(0, 5)
    .map((q) => q.title);
  const recentFailureTitles = (recentQuests ?? [])
    .filter((q) => q.status === "failed")
    .slice(0, 3)
    .map((q) => q.title);
  const recentAchievementNames = (achievementRows ?? []).map((a) => a.name);

  return {
    name: profile?.name ?? "Adventurer",
    level: profile?.level ?? 1,
    xp: profile?.xp ?? 0,
    currentGoalTitle: goal?.title ?? null,
    recentQuestTitles,
    recentFailureTitles,
    recentAchievementNames,
    question,
  };
}
