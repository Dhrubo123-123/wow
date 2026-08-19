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

  // A real (non-anonymous) account that's already finished onboarding
  // shouldn't redo it.
  if (user && !user.is_anonymous) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();
    if (profile?.onboarding_completed_at) redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh py-6">
      <DayOneFlow />
    </div>
  );
}
