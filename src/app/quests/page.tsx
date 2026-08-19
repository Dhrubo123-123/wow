import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardContent, CardDescription, CardTitle } from "@/components/ui";
import { QUEST_DIFFICULTY_LABELS, type QuestDifficulty, type QuestStatus } from "@/lib/quests";

const STATUS_LABELS: Record<QuestStatus, string> = {
  available: "Available",
  accepted: "Accepted",
  in_progress: "In Progress",
  submitted: "Submitted",
  under_review: "Under Review",
  completed: "Completed",
  failed: "Failed",
  expired: "Expired",
};

const STATUS_ORDER: QuestStatus[] = [
  "in_progress",
  "accepted",
  "available",
  "submitted",
  "under_review",
  "completed",
  "failed",
  "expired",
];

export default async function QuestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: quests } = await supabase
    .from("quests")
    .select("id, title, difficulty, xp_reward, estimated_minutes, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const sorted = (quests ?? [])
    .slice()
    .sort((a, b) => STATUS_ORDER.indexOf(a.status as QuestStatus) - STATUS_ORDER.indexOf(b.status as QuestStatus));

  return (
    <div className="space-y-3 stagger-children p-4">
      <h1 className="text-lg font-semibold">Quests</h1>

      {sorted.length === 0 && (
        <Card>
          <CardContent>
            <CardDescription>
              No quests yet. Set a goal on your dashboard to get your first
              AI-generated quest.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {sorted.map((quest) => (
        <Link key={quest.id} href={`/quests/${quest.id}`} className="block">
          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">{quest.title}</CardTitle>
                <Badge
                  variant={
                    quest.status === "completed"
                      ? "success"
                      : quest.status === "failed"
                        ? "danger"
                        : "default"
                  }
                >
                  {STATUS_LABELS[quest.status as QuestStatus]}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{QUEST_DIFFICULTY_LABELS[quest.difficulty as QuestDifficulty]}</Badge>
                <Badge variant="accent">+{quest.xp_reward} XP</Badge>
                <Badge>{quest.estimated_minutes} min</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
