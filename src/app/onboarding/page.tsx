import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, name, preferred_language, occupation, primary_objective")
    .eq("id", user.id)
    .single();

  // Already onboarded — don't make a returning user redo it.
  if (profile?.onboarding_completed_at) redirect("/dashboard");

  return (
    <div className="min-h-dvh p-6">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set up your ascent</h1>
          <p className="mt-1 text-sm text-muted">
            A few details so EMBER can generate quests that actually fit
            your life.
          </p>
        </div>
        <OnboardingForm
          userId={user.id}
          initialName={profile?.name ?? ""}
          initialLanguage={profile?.preferred_language ?? "en"}
          initialOccupation={profile?.occupation ?? ""}
          initialObjective={profile?.primary_objective ?? ""}
        />
      </div>
    </div>
  );
}
