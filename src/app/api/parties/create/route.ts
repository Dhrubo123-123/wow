import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Roadmap item 7 — creates a party and adds the creator as its first member. */
export async function POST() {
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

  const { data: party, error } = await supabase
    .from("parties")
    .insert({ created_by: user.id })
    .select("id, invite_code")
    .single();

  if (error || !party) {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const { error: memberError } = await supabase
    .from("party_members")
    .insert({ party_id: party.id, user_id: user.id });

  if (memberError) {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  return NextResponse.json({ partyId: party.id, inviteCode: party.invite_code });
}
