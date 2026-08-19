import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { checkRateLimit } from "@/lib/rateLimit";

const VALID_NAMES = new Set<string>(Object.values(EVENT));

const RequestSchema = z.object({
  name: z.string().refine((n) => VALID_NAMES.has(n), { message: "Unknown event name" }),
  props: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Client-triggered analytics events (retention roadmap §0). Runs under
 * the caller's own RLS-scoped session — `events` has an insert-own
 * policy, so there's no need for the admin client here, same reasoning
 * as the AI Mentor's message history writes.
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
    // Analytics is best-effort — a malformed event is a client bug,
    // not something worth surfacing to the user. Swallow it quietly.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  // Generous — this is fire-and-forget UI telemetry, not a
  // security-sensitive action, but still capped against a runaway
  // client-side loop.
  const rate = checkRateLimit("events", user.id, 120, 60);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  await logEvent(supabase, user.id, parsed.data.name as (typeof EVENT)[keyof typeof EVENT], parsed.data.props);
  return NextResponse.json({ ok: true });
}
