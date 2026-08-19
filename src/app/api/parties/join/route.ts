import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";

const RequestSchema = z.object({
  inviteCode: z.string().trim().min(1).max(32),
});

const MAX_PARTY_SIZE = 4;

/** Roadmap item 7 — join a party by invite code. One party per user at a time. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an invite code." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("party_members")
    .select("party_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You're already in a party." }, { status: 409 });
  }

  const { data: party } = await supabase
    .from("parties")
    .select("id")
    .eq("invite_code", parsed.data.inviteCode.toLowerCase())
    .maybeSingle();
  if (!party) {
    return NextResponse.json({ error: "That invite code doesn't match a party." }, { status: 404 });
  }

  const { count } = await supabase
    .from("party_members")
    .select("user_id", { count: "exact", head: true })
    .eq("party_id", party.id);
  if ((count ?? 0) >= MAX_PARTY_SIZE) {
    return NextResponse.json({ error: "That party is full." }, { status: 409 });
  }

  const { error } = await supabase.from("party_members").insert({ party_id: party.id, user_id: user.id });
  if (error) {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  await logEvent(supabase, user.id, EVENT.PARTY_JOINED, { partyId: party.id });

  return NextResponse.json({ partyId: party.id });
}
