"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, useToast } from "@/components/ui";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
];

const SKILL_LEVELS = [
  { value: 1, label: "Complete beginner" },
  { value: 2, label: "Some experience" },
  { value: 3, label: "Comfortable, want structure" },
  { value: 4, label: "Advanced, chasing mastery" },
];

interface OnboardingFormProps {
  userId: string;
  initialName: string;
  initialLanguage: string;
  initialOccupation: string;
  initialObjective: string;
}

export function OnboardingForm({
  userId,
  initialName,
  initialLanguage,
  initialOccupation,
  initialObjective,
}: OnboardingFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState(initialLanguage || "en");
  const [occupation, setOccupation] = useState(initialOccupation);
  const [primaryObjective, setPrimaryObjective] = useState(initialObjective);
  const [targetGoal, setTargetGoal] = useState("");
  const [targetDays, setTargetDays] = useState<number | "">(90);
  const [skillLevel, setSkillLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        title: targetGoal,
        status: "active",
        target_days: targetDays === "" ? null : targetDays,
        ai_plan: { skill_level: skillLevel },
      })
      .select("id")
      .single();

    if (goalError || !goal) {
      setLoading(false);
      setError("Something went wrong. Your progress was not saved. Please try again.");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        name,
        preferred_language: language,
        occupation,
        primary_objective: primaryObjective,
        current_goal_id: goal.id,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (profileError) {
      setLoading(false);
      setError("Something went wrong. Your progress was not saved. Please try again.");
      return;
    }

    // Phase 7: turn the goal into milestones + an initial quest set.
    // Best-effort — onboarding itself already succeeded, so a flaky AI
    // call here shouldn't strand the user on this screen (Phase 24: "your
    // progress is safe"). The dashboard/quests screens (Phase 8/9) will
    // offer a retry once they exist.
    try {
      const res = await fetch("/api/goals/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: goal.id }),
      });
      if (!res.ok) {
        toast({
          title: "Your first quest is still on its way",
          description: "We saved your goal — quests will appear shortly.",
          variant: "warning",
        });
      }
    } catch {
      toast({
        title: "Your first quest is still on its way",
        description: "We saved your goal — quests will appear shortly.",
        variant: "warning",
      });
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            What should we call you?
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="language" className="text-sm font-medium">
            Preferred language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="occupation" className="text-sm font-medium">
            Occupation
          </label>
          <input
            id="occupation"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="e.g. Student, Designer, Founder"
            className="h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="objective" className="text-sm font-medium">
            Primary objective
          </label>
          <input
            id="objective"
            required
            value={primaryObjective}
            onChange={(e) => setPrimaryObjective(e.target.value)}
            placeholder="e.g. Freelancing income, Fitness, Learning to code"
            className="h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="goal" className="text-sm font-medium">
            Your first goal
          </label>
          <textarea
            id="goal"
            required
            rows={3}
            value={targetGoal}
            onChange={(e) => setTargetGoal(e.target.value)}
            placeholder="e.g. Earn ₹50,000 freelancing in 90 days"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="days" className="text-sm font-medium">
            Timeframe (days)
          </label>
          <input
            id="days"
            type="number"
            min={1}
            max={365}
            value={targetDays}
            onChange={(e) =>
              setTargetDays(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Current skill level</legend>
          <div className="space-y-2">
            {SKILL_LEVELS.map((level) => (
              <label
                key={level.value}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="skillLevel"
                  value={level.value}
                  checked={skillLevel === level.value}
                  onChange={() => setSkillLevel(level.value)}
                  className="accent-[var(--primary)]"
                />
                {level.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Begin
      </Button>
    </form>
  );
}
