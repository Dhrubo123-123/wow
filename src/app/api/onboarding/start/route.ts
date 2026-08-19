import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { logError } from "@/lib/observability/logger";
import { STARTER_QUESTS, type GoalCategory } from "@/lib/onboarding/starterQuests";
import type { Json } from "@/lib/supabase/types";

const RequestSchema = z.object({
  category: z.enum(["fitness", "cooking", "learning", "productivity", "other"]),
});

function clientIp(request: Request): string {
  // Vercel sets this on every request; falls back to a constant bucket
  // if absent (local dev) rather than throwing.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Roadmap item 2 — creates the day-one starter quest for an
 * (anonymous or real) session. No AI call at all: the quest comes from
 * a hand-authored bank (lib/onboarding/starterQuests.ts), so this is
 * fast, free, and can never fail the way an AI generation could on the
 * single most important first impression in the app.
 *
 * Anon-auth mitigation: caps starter-session starts per IP per day —
 * the one place in the app an unauthenticated (or freshly-anonymous)
 * caller can trigger real writes, so it's the one place worth capping
 * by IP rather than by user id.
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
    return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  }

  const ip = clientIp(request);
  const ipRate = checkRateLimit("onboarding-start-ip", ip, 20, 24 * 60 * 60);
  if (!ipRate.allowed) {
    return NextResponse.json(
      { error: "Too many new sessions from this network today. Please try again tomorrow." },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();

  // "1 starter eval per anon session" — gated here at quest-creation
  // time too, not just at completion, so a user can't spin up multiple
  // starter quests in one session even before finishing the first.
  const { data: profile } = await admin
    .from("profiles")
    .select("starter_quest_completed_at, current_goal_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.starter_quest_completed_at) {
    return NextResponse.json({ error: "You've already completed your starter quest." }, { status: 409 });
  }

  const template = STARTER_QUESTS[parsed.data.category as GoalCategory];

  try {
    const { data: goal, error: goalError } = await admin
      .from("goals")
      .insert({
        user_id: user.id,
        title: template.goalTitle,
        target_days: 60,
        status: "active",
      })
      .select("id")
      .single();

    if (goalError || !goal) throw goalError ?? new Error("goal insert returned no row");

    const { data: skill } = await admin
      .from("skills")
      .select("id")
      .eq("key", template.skillKey)
      .maybeSingle();

    const { data: quest, error: questError } = await admin
      .from("quests")
      .insert({
        user_id: user.id,
        goal_id: goal.id,
        skill_id: skill?.id ?? null,
        title: template.title,
        description: template.objective,
        objective: template.objective,
        difficulty: 1,
        estimated_minutes: template.estimatedMinutes,
        xp_reward: 100, // STARTER_QUEST_XP — literal here to avoid a client<->server drift risk
        evidence_required: true,
        evidence_type: template.evidenceType,
        success_criteria: template.successCriteria as Json,
        instructions: template.instructions as Json,
        status: "in_progress",
      })
      .select("id, title, objective, instructions, evidence_type")
      .single();

    if (questError || !quest) throw questError ?? new Error("quest insert returned no row");

    await admin.from("quest_attempts").insert({
      quest_id: quest.id,
      user_id: user.id,
      status: "in_progress",
    });

    await admin.from("profiles").update({ current_goal_id: goal.id }).eq("id", user.id);

    await logEvent(admin, user.id, EVENT.ONBOARDING_STARTED, { category: parsed.data.category });

    return NextResponse.json({ goalId: goal.id, quest });
  } catch (err) {
    logError("db", err, { scope: "onboarding-start", userId: user.id });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
