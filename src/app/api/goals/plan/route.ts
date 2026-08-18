import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIProviderError } from "@/lib/ai";
import { matchSkillId } from "@/lib/quests";
import type { Json } from "@/lib/supabase/types";

const RequestSchema = z.object({
  goalId: z.string().uuid(),
});

// Server-enforced ceiling — the AI's xp_reward proposal is never trusted
// outright (brief §14/§22's "AI must not be allowed to award unlimited XP").
const MAX_INITIAL_QUEST_XP = 500;

/**
 * Phase 7 — AI goal decomposition. Takes a goal the user already created
 * (during onboarding, RLS lets them insert their own `goals` row) and
 * generates milestones + weekly objectives + the *next useful set* of
 * quests (1-3, never hundreds — brief §15). Quest rows are inserted via
 * the admin client because `quests` has no user-insert RLS policy by
 * design (Phase 2): only the server creates quests.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // RLS (auth.uid() = user_id) guarantees this can only fetch the
  // caller's own goal — no need for a manual ownership check.
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, title, target_days, ai_plan")
    .eq("id", parsed.data.goalId)
    .single();

  if (goalError || !goal) {
    return NextResponse.json({ error: "Goal not found." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("occupation")
    .eq("id", user.id)
    .single();

  const existingPlan = (goal.ai_plan ?? {}) as { skill_level?: number };
  const skillLevel = existingPlan.skill_level ?? 1;

  let plan;
  try {
    plan = await getAIProvider().generateGoalPlan({
      goalTitle: goal.title,
      targetDays: goal.target_days,
      skillLevel,
      occupation: profile?.occupation ?? null,
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      // Phase 24 controlled-error copy — never a raw error to the client.
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    throw err;
  }

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("goals")
    .update({
      ai_plan: {
        ...existingPlan,
        milestones: plan.milestones,
        weekly_objectives: plan.weekly_objectives,
      } as Json,
    })
    .eq("id", goal.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Something went wrong. Your progress was not lost." },
      { status: 500 },
    );
  }

  const questRows = await Promise.all(
    plan.initial_quests.map(async (q) => ({
      user_id: user.id,
      goal_id: goal.id,
      // Loose name match against the Phase 16 skills table — falls back
      // to null (unattributed) rather than failing the whole request.
      skill_id: await matchSkillId(admin, q.skill),
      title: q.title,
      description: `${q.description}\n\nSkill focus: ${q.skill}`,
      objective: q.objective,
      difficulty: q.difficulty,
      estimated_minutes: q.estimated_minutes,
      xp_reward: Math.min(q.xp_reward, MAX_INITIAL_QUEST_XP),
      evidence_required: q.evidence_required,
      evidence_type: q.evidence_type,
      success_criteria: q.success_criteria as Json,
      instructions: q.instructions as Json,
      status: "available" as const,
      ai_raw_response: plan as unknown as Json,
    })),
  );

  const { data: insertedQuests, error: insertError } = await admin
    .from("quests")
    .insert(questRows)
    .select("id, title, difficulty, xp_reward, status");

  if (insertError) {
    return NextResponse.json(
      { error: "Something went wrong. Your progress was not lost." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    milestones: plan.milestones,
    weeklyObjectives: plan.weekly_objectives,
    quests: insertedQuests,
  });
}
