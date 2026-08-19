import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DayOneFlow } from "@/components/onboarding/DayOneFlow";

/**
 * Retention roadmap item 2 — unlike every other route, this page does
 * NOT redirect an unauthenticated visitor to /login. The whole point
 * of the day-one flow is that account creation happens LAST (after the
 * first real win), via Supabase anonymous auth established client-side
 * in DayOneFlow — so a visitor with no session at all is exactly who
 * this page is for, not an error case.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bug fix: this used to only check resume state for real accounts.
  // An anonymous session that finished the starter quest (which sets
  // starter_quest_completed_at) but left before the schedule step
  // would come back here, always render step "category" again, then
  // get permanently blocked by /api/onboarding/start's "1 starter
  // quest per session" 409 with no way forward — a dead end.
  // Any session (anon or real) that's already fully done shouldn't
  // redo onboarding; one that's mid-flow should resume where it left
  // off instead of restarting.
  let resumeStep: "schedule" | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at, starter_quest_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.onboarding_completed_at) redirect("/dashboard");
    if (profile?.starter_quest_completed_at) resumeStep = "schedule";
  }

  return (
    <div className="min-h-dvh py-6">
      <DayOneFlow resumeStep={resumeStep} />
    </div>
  );
}
