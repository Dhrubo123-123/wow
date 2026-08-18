import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, AIProviderError, buildMentorContext } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import type { Json } from "@/lib/supabase/types";

const RequestSchema = z.object({
  question: z.string().min(1).max(500),
});

/**
 * Phase 18 — AI Mentor. Everything here runs under the caller's own
 * RLS-scoped session (no admin client): `ai_messages` has insert/select-
 * own policies (Phase 2), so there's no need to bypass RLS just to save
 * a chat turn.
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

  const context = await buildMentorContext(supabase, user.id, parsed.data.question);

  let message: string;
  try {
    message = await getAIProvider().generateMentorResponse(context);
  } catch (err) {
    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "THE GAME MASTER IS TEMPORARILY UNAVAILABLE. Your progress is safe." },
        { status: 503 },
      );
    }
    throw err;
  }

  // Best-effort history — a failed insert shouldn't hide the answer the
  // user is already looking at.
  await supabase.from("ai_messages").insert([
    { user_id: user.id, role: "user", content: parsed.data.question },
    {
      user_id: user.id,
      role: "assistant",
      content: message,
      context: context as unknown as Json,
    },
  ]);

  return NextResponse.json({ message });
}
