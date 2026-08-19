import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { generateNextQuest } from "./generateNext";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";

// A quest actively underway takes priority over one merely available.
const QUEST_PRIORITY = { in_progress: 0, accepted: 1, available: 2 } as const;

export interface TodayQuest {
  id: string;
  title: string;
  difficulty: number;
  xp_reward: number;
  estimated_minutes: number;
  status: "available" | "accepted" | "in_progress";
  expires_at: string;
  skill_id: string | null;
}

/**
 * Roadmap item 3 — the "Today" screen's single source of truth for
 * "what is THE quest right now". Resolves the current open quest for
 * a user's active goal, and — if it's expired or there simply isn't
 * one — replaces it with a fresh one via the same generateNextQuest
 * path an evaluation uses. Expiring a quest is never a penalty: no
 * XP/streak is touched, the old one is just marked 'expired' and a
 * new one takes its place.
 *
 * Race-safe: the expire-and-refresh step uses an atomic conditional
 * UPDATE (`.eq("status", quest.status)`) so if two requests hit this
 * at once (e.g. a page load racing the PWA shortcut), only the one
 * that actually flips the row's status generates a replacement.
 */
export async function getOrRefreshTodayQuest(
  admin: SupabaseClient<Database>,
  userId: string,
  currentGoalId: string | null,
): Promise<TodayQuest | null> {
  const { data: quests } = await admin
    .from("quests")
    .select("id, title, difficulty, xp_reward, estimated_minutes, status, expires_at, goal_id, skill_id")
    .eq("user_id", userId)
    .in("status", ["available", "accepted", "in_progress"])
    .order("created_at", { ascending: true });

  const current = quests
    ?.slice()
    .sort((a, b) => QUEST_PRIORITY[a.status as keyof typeof QUEST_PRIORITY] - QUEST_PRIORITY[b.status as keyof typeof QUEST_PRIORITY])[0];

  const now = Date.now();
  const isExpired = current && new Date(current.expires_at).getTime() < now;

  if (current && !isExpired) {
    return {
      id: current.id,
      title: current.title,
      difficulty: current.difficulty,
      xp_reward: current.xp_reward,
      estimated_minutes: current.estimated_minutes,
      status: current.status as TodayQuest["status"],
      expires_at: current.expires_at,
      skill_id: current.skill_id,
    };
  }

  if (!currentGoalId) return null;

  const { data: goal } = await admin.from("goals").select("id, title").eq("id", currentGoalId).single();
  if (!goal) return null;

  if (current && isExpired) {
    const { data: expiredRow } = await admin
      .from("quests")
      .update({ status: "expired" })
      .eq("id", current.id)
      .eq("status", current.status) // atomic guard — only the winner of a race proceeds below
      .select("id")
      .maybeSingle();

    if (!expiredRow) {
      // Another request already won the race and is generating the
      // replacement — don't double up.
      return null;
    }

    await logEvent(admin, userId, EVENT.QUEST_EXPIRED, { questId: current.id });
  }

  const inserted = await generateNextQuest(
    admin,
    userId,
    goal,
    current?.title ?? "",
    current?.difficulty ?? 1,
  );

  if (!inserted) return null;

  const { data: fresh } = await admin
    .from("quests")
    .select("id, title, difficulty, xp_reward, estimated_minutes, status, expires_at, skill_id")
    .eq("id", inserted.id)
    .single();

  return fresh
    ? {
        id: fresh.id,
        title: fresh.title,
        difficulty: fresh.difficulty,
        xp_reward: fresh.xp_reward,
        estimated_minutes: fresh.estimated_minutes,
        status: fresh.status as TodayQuest["status"],
        expires_at: fresh.expires_at,
        skill_id: fresh.skill_id,
      }
    : null;
}
