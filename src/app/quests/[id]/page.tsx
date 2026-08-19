import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { QuestActions } from "@/components/quests/QuestActions";
import { QUEST_DIFFICULTY_LABELS, type QuestDifficulty, type QuestStatus, type EvidenceType } from "@/lib/quests";

export default async function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: quest } = await supabase
    .from("quests")
    .select("*")
    .eq("id", id)
    .single();

  // RLS scopes the row to the caller's own quests — a missing row means
  // either it doesn't exist or it isn't this user's, and either way the
  // right answer is the same 404.
  if (!quest) notFound();

  let attemptId: string | null = null;
  if (quest.status === "in_progress") {
    const { data: attempt } = await supabase
      .from("quest_attempts")
      .select("id")
      .eq("quest_id", quest.id)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    attemptId = attempt?.id ?? null;
  }

  const successCriteria = (quest.success_criteria as string[] | null) ?? [];
  const instructions = (quest.instructions as string[] | null) ?? [];

  return (
    <div className="space-y-4 stagger-children p-4">
      <Card>
        <CardHeader>
          <CardTitle>{quest.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{QUEST_DIFFICULTY_LABELS[quest.difficulty as QuestDifficulty]}</Badge>
            <Badge variant="accent">+{quest.xp_reward} XP</Badge>
            <Badge>{quest.estimated_minutes} min</Badge>
          </div>
          <p className="text-sm">{quest.description}</p>
          <div>
            <p className="text-xs font-medium text-muted">Objective</p>
            <p className="text-sm">{quest.objective}</p>
          </div>
        </CardContent>
      </Card>

      {instructions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-4 text-sm">
              {instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {successCriteria.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Success criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {successCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <QuestActions
        questId={quest.id}
        userId={user.id}
        status={quest.status as QuestStatus}
        attemptId={attemptId}
        evidenceType={quest.evidence_type as EvidenceType | null}
      />
    </div>
  );
}
