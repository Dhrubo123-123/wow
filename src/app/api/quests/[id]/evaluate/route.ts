import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIProviderError } from "@/lib/ai";
import { updateStreak } from "@/lib/progression";
import { runQuestEvaluation } from "@/lib/quests";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkBudget, isOrgBudgetNearlyExhausted } from "@/lib/ai/budget";

// The text model the configured provider actually uses — see
// AI_PROVIDER/GROQ_MODEL in .env.local. Org-wide budget degradation
// (isOrgBudgetNearlyExhausted) is checked against this specific
// model's real RPD/TPD, not a guess.
const TEXT_MODEL = "openai/gpt-oss-120b" as const;

/**
 * Phase 14 — closes the core loop:
 *   submitted -> under_review -> AI evaluates -> completed/failed
 *     -> XP awarded (clamped) -> skill XP -> streak -> next quest generated
 *
 * Called by QuestActions immediately after a successful submission.
 * The actual evaluation logic lives in lib/quests/evaluateQuest.ts
 * (roadmap item A3) — shared with the Vercel Cron job
 * (/api/jobs/process-evaluations) that sweeps any quest this route
 * had to defer under the graceful-degradation path below.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: questId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId: string = user.id;

  // Evaluation awards real XP — 10/minute is far more than a genuine
  // submit-and-wait workflow needs, tight enough to block abuse.
  const rate = checkRateLimit("quest-evaluate", userId, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  // RLS scopes this to the caller's own quest — confirms it exists and
  // is theirs, and that it's actually awaiting review, before handing
  // off to the admin-client-backed shared evaluator.
  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("id, status")
    .eq("id", questId)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  }
  if (quest.status !== "submitted") {
    return NextResponse.json({ error: "This quest isn't awaiting review." }, { status: 409 });
  }

  const admin = createAdminClient();

  // Roadmap item A graceful degradation: if this user is over their
  // daily evaluation budget, OR the whole org is near Groq's real
  // daily limit (RPD or TPD — see isOrgBudgetNearlyExhausted) for the
  // text model, don't call the AI at all. The quest stays "submitted"
  // so the Vercel Cron sweep (roadmap item A3,
  // /api/jobs/process-evaluations, every 10 min) picks it up and
  // completes the real evaluation once capacity is back — this is now
  // a genuine deferred retry, not just an honest-sounding promise.
  const [evalBudget, orgNearLimit] = await Promise.all([
    checkBudget(admin, userId, "evaluations"),
    isOrgBudgetNearlyExhausted(admin, TEXT_MODEL),
  ]);

  if (!evalBudget.allowed || orgNearLimit) {
    // Streak extends on SUBMISSION here, not evaluation — idempotent-
    // safe if the real evaluation runs later the same day
    // (nextStreakState's gap===0 branch is a no-op).
    const streak = await updateStreak(admin, userId);
    await logEvent(admin, userId, EVENT.STREAK_EXTENDED, {
      currentStreak: streak.currentStreak,
      degraded: true,
    });
    return NextResponse.json({
      queued: true,
      passed: null,
      feedback:
        "The Game Master is reviewing a lot of quests right now — your XP will land within the hour. Your streak is already safe.",
      streak,
    });
  }

  try {
    const result = await runQuestEvaluation(admin, questId, userId);
    return NextResponse.json(result);
  } catch (err) {
    logError("ai_evaluation", err, { questId, userId });
    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Something went wrong. Your progress is safe." },
      { status: 500 },
    );
  }
}
