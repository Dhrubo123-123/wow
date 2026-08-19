import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const RequestSchema = z.object({
  // "HH:MM" 24h — validated loosely, this only ever drives narration/
  // reminder timing (roadmap items 5/6), never anything security-sensitive.
  preferredQuestTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
});

/** Roadmap item 2's scheduling question — "when do you usually have
 *  time for this?" Runs under the caller's own RLS session; profiles
 *  has an update-own policy already. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a valid time." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ preferred_quest_time: parsed.data.preferredQuestTime })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
