import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ProgressBar,
} from "@/components/ui";
import { xpForNextLevel } from "@/lib/progression/levels";
import { QUEST_DIFFICULTY_LABELS, type QuestDifficulty } from "@/lib/quests";
import { DashboardWelcomeVoice } from "@/components/audio/DashboardWelcomeVoice";

interface GoalAIPlan {
  skill_level?: number;
  milestones?: string[];
  weekly_objectives?: string[];
}

// A quest actively underway takes priority over one merely available,
// which takes priority over the rest — this is what "current quest"
// means until Phase 9 gives the user explicit accept/start actions.
const QUEST_PRIORITY = { in_progress: 0, accepted: 1, available: 2 } as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const [{ data: goal }, { data: quests }, { data: streak }] = await Promise.all([
    profile.current_goal_id
      ? supabase
          .from("goals")
          .select("title, ai_plan")
          .eq("id", profile.current_goal_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("quests")
      .select("id, title, difficulty, xp_reward, estimated_minutes, status")
      .eq("user_id", user.id)
      .in("status", ["available", "accepted", "in_progress"])
      .order("created_at", { ascending: true }),
    supabase
      .from("streaks")
      .select("current_streak")
      .eq("user_id", user.id)
      .single(),
  ]);

  const currentQuest = quests
    ?.slice()
    .sort((a, b) => QUEST_PRIORITY[a.status as keyof typeof QUEST_PRIORITY] - QUEST_PRIORITY[b.status as keyof typeof QUEST_PRIORITY])[0];

  const displayName = profile.name || user.email || "Adventurer";
  const { xpIntoLevel, xpNeeded } = xpForNextLevel(profile.xp, profile.level);
  const aiPlan = (goal?.ai_plan ?? null) as GoalAIPlan | null;
  const nextMilestone = aiPlan?.milestones?.[0] ?? null;

  return (
    <div className="space-y-4 stagger-children p-4">
      <DashboardWelcomeVoice name={displayName.split(" ")[0] ?? "Adventurer"} />
      <div className="flex items-center gap-3">
        <Avatar name={displayName} src={profile.avatar_url} levelBadge={profile.level} />
        <div>
          <p className="text-lg font-semibold">Welcome back, {displayName.split(" ")[0]}</p>
          <p className="text-xs text-muted">
            {goal ? goal.title : "Set a goal to get your first quest."}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <ProgressBar
            value={xpIntoLevel}
            max={xpNeeded}
            label={`Level ${profile.level}`}
            showValue
          />
          <Badge variant="accent">
            <span className="animate-flame-flicker" aria-hidden="true">
              🔥
            </span>{" "}
            {streak?.current_streak ?? 0} day streak
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current quest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentQuest ? (
            <>
              <div>
                <p className="font-medium">{currentQuest.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>
                    {QUEST_DIFFICULTY_LABELS[currentQuest.difficulty as QuestDifficulty]}
                  </Badge>
                  <Badge variant="accent">+{currentQuest.xp_reward} XP</Badge>
                  <Badge>{currentQuest.estimated_minutes} min</Badge>
                </div>
              </div>
              <Link href={`/quests/${currentQuest.id}`} className="block">
                <Button fullWidth>Start Quest</Button>
              </Link>
            </>
          ) : (
            <>
              <CardDescription>No active quest right now.</CardDescription>
              <Link href="/quests" className="block">
                <Button fullWidth variant="secondary">
                  View Quests
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      {nextMilestone && (
        <Card>
          <CardHeader>
            <CardTitle>Next milestone</CardTitle>
          </CardHeader>
          <CardContent>{nextMilestone}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Skills &amp; achievements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Link href="/skills" className="block text-sm text-primary hover:underline">
            View skill tree →
          </Link>
          <Link href="/achievements" className="block text-sm text-primary hover:underline">
            View achievements →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
