import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { logError } from "@/lib/observability/logger";

/**
 * Vercel Cron (vercel.json, once daily — Vercel Hobby plan limit) →
 * roadmap item 6. Only reminds users who (a) opted into push and (b)
 * still have an open quest sitting unclaimed — never pings someone
 * who already did today's quest, since that would just train people
 * to ignore the notification.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];

  let reminded = 0;
  for (const userId of userIds) {
    const { data: quest } = await admin
      .from("quests")
      .select("title")
      .eq("user_id", userId)
      .in("status", ["available", "accepted", "in_progress"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!quest) continue;

    try {
      const { sent } = await sendPushToUser(admin, userId, {
        title: "Your quest is waiting 🔥",
        body: quest.title,
        url: "/quests/today",
      });
      if (sent > 0) reminded += 1;
    } catch (err) {
      logError("push", err, { userId });
    }
  }

  return NextResponse.json({ reminded, checked: userIds.length });
}
