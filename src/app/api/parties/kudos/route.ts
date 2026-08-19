import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";

const RequestSchema = z.object({
  toUserId: z.string().uuid(),
});

/** Roadmap item 7 — send kudos to a fellow party member. */
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

  if (parsed.data.toUserId === user.id) {
    return NextResponse.json({ error: "You can't send kudos to yourself." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("party_members")
    .select("party_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "You're not in a party." }, { status: 409 });
  }

  const { data: recipientMembership } = await supabase
    .from("party_members")
    .select("user_id")
    .eq("party_id", membership.party_id)
    .eq("user_id", parsed.data.toUserId)
    .maybeSingle();
  if (!recipientMembership) {
    return NextResponse.json({ error: "That person isn't in your party." }, { status: 404 });
  }

  const { error } = await supabase.from("kudos").insert({
    party_id: membership.party_id,
    from_user_id: user.id,
    to_user_id: parsed.data.toUserId,
  });
  if (error) {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  await logEvent(supabase, user.id, EVENT.KUDOS_GIVEN, {
    partyId: membership.party_id,
    toUserId: parsed.data.toUserId,
  });

  return NextResponse.json({ ok: true });
}
