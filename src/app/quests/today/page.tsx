import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrRefreshTodayQuest } from "@/lib/quests";

/**
 * Roadmap item 3 — the PWA shortcut's target. Resolves "today's quest"
 * (expiring and replacing it if needed) and hands off straight to the
 * quest detail page, which already has the full evidence-capture flow.
 * This route has no UI of its own — it's a resolver, not a screen.
 */
export default async function TodayQuestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_goal_id, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const quest = await getOrRefreshTodayQuest(
    createAdminClient(),
    user.id,
    profile.current_goal_id,
  );

  redirect(quest ? `/quests/${quest.id}` : "/dashboard");
}
