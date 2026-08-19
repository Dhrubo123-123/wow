import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeLiveFrame } from "@/lib/ai/coach";
import { AIProviderError } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkBudget, isOrgBudgetNearlyExhausted } from "@/lib/ai/budget";

// The vision model the configured provider uses — see lib/ai/coach.ts.
const VISION_MODEL = "qwen/qwen3.6-27b" as const;

const RequestSchema = z.object({
  // A data: URL — validated by prefix/size below, not deeply parsed.
  frame: z.string().min(100),
  lang: z.enum(["en", "hi"]).default("en"),
  recentMessages: z.array(z.string()).max(5).default([]),
  // Set by the client on the very first frame of a session (see
  // LiveCoach.tsx) — this, not every frame, is what "1 trial session
  // total" is checked against.
  isSessionStart: z.boolean().default(false),
});

// ~2MB base64-encoded is plenty for a JPEG snapshot at capture-quality
// resolution — anything bigger is almost certainly a bug on the client,
// not a legitimate frame.
const MAX_FRAME_CHARS = 2_800_000;

/**
 * Live AI Coach (post-launch engagement pass) — "AI has eyes" while a
 * quest is in progress. Stateless and read-only by design:
 *   - Never persists the frame anywhere (not to Storage, not to the DB,
 *     not even to logs) — it's analyzed in memory and discarded the
 *     moment this request returns, same "camera must never persist
 *     after leaving the page" spirit as the evidence capture flow.
 *   - Never touches XP, quest status, or any other game state — purely
 *     advisory spoken feedback, so there's no "AI awards XP" surface
 *     here at all.
 *
 * Roadmap item A: free plan gets 1 trial session, ever (not per day —
 * this feature is the most expensive per-use one in the app).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: questId } = await params;

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
  if (!parsed.data.frame.startsWith("data:image/") || parsed.data.frame.length > MAX_FRAME_CHARS) {
    return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId: string = user.id;

  // A live coach session polls every ~45s client-side (see
  // LiveCoach.tsx — matched to the vision model's real RPD, not just
  // TPM). 8/minute gives headroom above that pace while still blocking
  // a runaway loop from burning through the shared quota.
  const rate = checkRateLimit("live-coach", userId, 8, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Slow down a little — try again in a few seconds." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const admin = createAdminClient();

  if (parsed.data.isSessionStart) {
    // Per-user cap first (cheap — one indexed count query)...
    const budget = await checkBudget(admin, userId, "coach_sessions");
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "You've used your free Live Coach trial. Upgrade to EMBER Pro for unlimited sessions." },
        { status: 403 },
      );
    }
    // ...then the org-wide one. Found via this feature's own load-test
    // script (scripts/load-test-ai-budget.mjs): even with every user
    // capped at 1 trial, a day where enough different users' first
    // trials land at once can still exceed the vision model's shared
    // daily budget — the per-user cap alone doesn't protect the org.
    const orgNearLimit = await isOrgBudgetNearlyExhausted(admin, VISION_MODEL);
    if (orgNearLimit) {
      return NextResponse.json(
        {
          error:
            "The Live Coach is at capacity for today — please try your free trial again tomorrow.",
        },
        { status: 503 },
      );
    }
  }

  // RLS scopes this to the caller's own quest — confirms it exists and
  // is theirs before spending a vision-model call on it.
  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("id, title, objective, success_criteria, status")
    .eq("id", questId)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  }
  if (quest.status !== "in_progress") {
    return NextResponse.json(
      { error: "The Live Coach only works while a quest is in progress." },
      { status: 409 },
    );
  }

  try {
    const verdict = await analyzeLiveFrame(
      {
        frameDataUrl: parsed.data.frame,
        questTitle: quest.title,
        questObjective: quest.objective,
        successCriteria: (quest.success_criteria as string[] | null) ?? [],
        lang: parsed.data.lang,
        recentMessages: parsed.data.recentMessages,
      },
      { userId, admin },
    );

    if (parsed.data.isSessionStart) {
      await logEvent(admin, userId, EVENT.AI_CALL_LOGGED, {
        purpose: "coach",
        sessionStart: true,
        outcome: "success",
      });
    }

    return NextResponse.json(verdict);
  } catch (err) {
    logError("ai_provider", err, { scope: "live-coach", userId, questId });
    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    throw err;
  }
}
