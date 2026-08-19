import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Avatar,
  ProgressBar,
} from "@/components/ui";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SoundToggle } from "@/components/settings/SoundToggle";
import { xpForNextLevel } from "@/lib/progression/levels";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route, but Server Components should
  // never assume — redirect defensively if the session is somehow gone.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const { data: goal } = profile.current_goal_id
    ? await supabase
        .from("goals")
        .select("title, target_days, status, created_at")
        .eq("id", profile.current_goal_id)
        .single()
    : { data: null };

  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak, freezes_available")
    .eq("user_id", user.id)
    .single();

  const displayName = profile.name || user.email || "Adventurer";
  const { xpIntoLevel, xpNeeded } = xpForNextLevel(profile.xp, profile.level);

  return (
    <div className="space-y-4 stagger-children p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar name={displayName} src={profile.avatar_url} levelBadge={profile.level} />
            <div>
              <CardTitle>{displayName}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <ProgressBar
            value={xpIntoLevel}
            max={xpNeeded}
            label={`Level ${profile.level}`}
            showValue
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.occupation && <Badge>{profile.occupation}</Badge>}
            {profile.preferred_language && profile.preferred_language !== "en" && (
              <Badge>{profile.preferred_language.toUpperCase()}</Badge>
            )}
            <Badge variant="accent">
              <span className="animate-flame-flicker" aria-hidden="true">
                🔥
              </span>{" "}
              {streak?.current_streak ?? 0} day streak
            </Badge>
            {(streak?.freezes_available ?? 0) > 0 && (
              <Badge title="Streak freezes — automatically cover one missed day">
                ❄️ {streak?.freezes_available}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {goal && (
        <Card>
          <CardHeader>
            <CardTitle>Current goal</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{goal.title}</p>
            {goal.target_days && (
              <p className="mt-1 text-xs text-muted">
                Target: {goal.target_days} days
              </p>
            )}
          </CardContent>
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

      <SoundToggle />

      <Link
        href="/settings/device-access"
        className="block text-center text-sm text-muted hover:text-foreground"
      >
        Device Access Settings
      </Link>

      <LogoutButton fullWidth />
    </div>
  );
}
