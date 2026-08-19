import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { analyzeLiveFrame } from "@/lib/ai/coach";
import { AIProviderError } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/logger";

const RequestSchema = z.object({
  // A data: URL — validated by prefix/size below, not deeply parsed.
  frame: z.string().min(100),
  lang: z.enum(["en", "hi"]).default("en"),
  recentMessages: z.array(z.string()).max(5).default([]),
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

  // A live coach session polls every ~15s client-side (matched to the
  // vision model's own ~8000 TPM account limit — see lib/ai/coach.ts).
  // 8/minute gives a little headroom above that pace while still
  // blocking a runaway loop from burning through the shared quota.
  const rate = checkRateLimit("live-coach", userId, 8, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Slow down a little — try again in a few seconds." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
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
    const verdict = await analyzeLiveFrame({
      frameDataUrl: parsed.data.frame,
      questTitle: quest.title,
      questObjective: quest.objective,
      successCriteria: (quest.success_criteria as string[] | null) ?? [],
      lang: parsed.data.lang,
      recentMessages: parsed.data.recentMessages,
    });
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
