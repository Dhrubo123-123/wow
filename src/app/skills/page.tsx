import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ProgressBar } from "@/components/ui";

const MASTERY_XP_PER_LEVEL = 200; // mirrors lib/progression/skills.ts

export default async function SkillsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: skills }, { data: userSkills }] = await Promise.all([
    supabase.from("skills").select("*").order("sort_order", { ascending: true }),
    supabase.from("user_skills").select("skill_id, xp, mastery_level").eq("user_id", user.id),
  ]);

  const progressBySkill = new Map((userSkills ?? []).map((us) => [us.skill_id, us]));

  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-lg font-semibold">Skills</h1>
        <p className="text-xs text-muted">
          Every skill here comes from the database, not a hardcoded list —
          unlocking one takes completing quests tagged with it.
        </p>
      </div>

      {(!skills || skills.length === 0) && (
        <Card>
          <CardContent>
            <CardDescription>No skills configured yet.</CardDescription>
          </CardContent>
        </Card>
      )}

      {skills?.map((skill) => {
        const progress = progressBySkill.get(skill.id);
        const locked = !progress;
        const masteryXpTarget =
          typeof skill.requirements === "object" &&
          skill.requirements &&
          "mastery_xp" in skill.requirements
            ? Number((skill.requirements as { mastery_xp?: number }).mastery_xp) || 1000
            : 1000;

        return (
          <Card key={skill.id} className={locked ? "opacity-60" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true">{skill.icon}</span>
                  {skill.name}
                </CardTitle>
                <Badge variant={locked ? "default" : progress.mastery_level > 0 ? "accent" : "success"}>
                  {locked
                    ? "Locked"
                    : progress.mastery_level > 0
                      ? `Mastery ${progress.mastery_level}`
                      : "Unlocked"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardDescription>{skill.description}</CardDescription>
              {!locked && (
                <ProgressBar
                  value={progress.xp % MASTERY_XP_PER_LEVEL}
                  max={MASTERY_XP_PER_LEVEL}
                  showValue
                  label={`${progress.xp}/${masteryXpTarget} lifetime XP`}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
