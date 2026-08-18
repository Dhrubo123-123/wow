import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: achievements }, { data: unlocked }] = await Promise.all([
    supabase.from("achievements").select("*").order("created_at", { ascending: true }),
    supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", user.id),
  ]);

  const unlockedMap = new Map((unlocked ?? []).map((u) => [u.achievement_id, u.unlocked_at]));

  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-lg font-semibold">Achievements</h1>
        <p className="text-xs text-muted">
          Granted by deterministic rules, never by the AI — and each one
          can only ever be earned once.
        </p>
      </div>

      {(!achievements || achievements.length === 0) && (
        <Card>
          <CardContent>
            <CardDescription>No achievements configured yet.</CardDescription>
          </CardContent>
        </Card>
      )}

      {achievements?.map((achievement) => {
        const unlockedAt = unlockedMap.get(achievement.id);
        return (
          <Card key={achievement.id} className={!unlockedAt ? "opacity-60" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true">{achievement.icon}</span>
                  {achievement.name}
                </CardTitle>
                <Badge variant={unlockedAt ? "success" : "default"}>
                  {unlockedAt ? "Unlocked" : "Locked"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{achievement.description}</CardDescription>
              {unlockedAt && (
                <p className="mt-1 text-xs text-muted">
                  Unlocked {new Date(unlockedAt).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
