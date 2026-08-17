import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function OnboardingPage() {
  return (
    <PhasePlaceholder
      title="Onboarding"
      description="Collects name, preferred language, occupation, primary objective, target goal, and current skill level, then saves to Supabase."
      phase="Phase 3"
    />
  );
}
