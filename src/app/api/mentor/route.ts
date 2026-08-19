import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIProviderError, buildMentorContext } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkBudget } from "@/lib/ai/budget";
import { getCachedMentorAnswer, cacheMentorAnswer } from "@/lib/ai/mentorCache";
import type { Json } from "@/lib/supabase/types";

const RequestSchema = z.object({
  question: z.string().min(1).max(500),
});

/**
 * Phase 18 — AI Mentor. Everything here runs under the caller's own
 * RLS-scoped session (no admin client) for `ai_messages` — insert/select-
 * own policies (Phase 2) already cover that. `admin` is only used for
 * the FAQ cache table (roadmap item A), which has no public RLS policy.
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
    return NextResponse.json({ error: "Ask something a bit shorter." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // 10 questions/minute is generous for a real user, tight enough to
  // stop a script from burning through the AI provider's quota.
  const rate = checkRateLimit("mentor", user.id, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Ask me one at a time — try again in a few seconds." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const admin = createAdminClient();

  // Cache check first — a hit costs zero AI budget and is faster than
  // a round trip to Groq either way.
  const cached = await getCachedMentorAnswer(admin, parsed.data.question);
  if (cached) {
    await logEvent(admin, user.id, EVENT.AI_CALL_LOGGED, {
      purpose: "mentor",
      cacheHit: true,
      outcome: "success",
    });
    return NextResponse.json({ message: cached });
  }

  // Roadmap item A: 5 mentor turns/day on the free plan. Checked AFTER
  // the cache lookup on purpose — a cached answer doesn't spend budget,
  // so it shouldn't be blocked by it either.
  const budget = await checkBudget(admin, user.id, "mentor_turns");
  if (!budget.allowed) {
    return NextResponse.json({
      message:
        "You've used today's mentor questions — I'll be back tomorrow! In the meantime, check your current quest for what's next.",
    });
  }

  const context = await buildMentorContext(supabase, user.id, parsed.data.question);

  let message: string;
  try {
    message = await getAIProvider().generateMentorResponse(context, { userId: user.id, admin });
  } catch (err) {
    logError("ai_provider", err, { userId: user.id });
    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    throw err;
  }

  void cacheMentorAnswer(admin, parsed.data.question, message);

  // Best-effort history — a failed insert shouldn't hide the answer the
  // user is already looking at.
  const { error: insertError } = await supabase.from("ai_messages").insert([
    { user_id: user.id, role: "user", content: parsed.data.question },
    {
      user_id: user.id,
      role: "assistant",
      content: message,
      context: context as unknown as Json,
    },
  ]);

  if (insertError) {
    logError("db", insertError, { table: "ai_messages", userId: user.id });
  }

  return NextResponse.json({ message });
}
