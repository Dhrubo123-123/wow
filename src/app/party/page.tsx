import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PartyPanel } from "@/components/party/PartyPanel";

export default async function PartyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const { data: membership } = await supabase
    .from("party_members")
    .select("party_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-lg font-semibold">Party</h1>
        <PartyPanel userId={user.id} party={null} />
      </div>
    );
  }

  const [{ data: party }, { data: members }, { data: kudosReceived }] = await Promise.all([
    supabase.from("parties").select("id, name, invite_code").eq("id", membership.party_id).single(),
    supabase.from("party_members").select("user_id").eq("party_id", membership.party_id),
    supabase.from("kudos").select("to_user_id").eq("party_id", membership.party_id),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);

  const [{ data: memberProfiles }, { data: memberStreaks }] = await Promise.all([
    supabase.from("profiles").select("id, name, level").in("id", memberIds),
    supabase.from("streaks").select("user_id, current_streak").in("user_id", memberIds),
  ]);

  const streakByUser = new Map((memberStreaks ?? []).map((s) => [s.user_id, s.current_streak]));
  const kudosCountByUser = new Map<string, number>();
  for (const k of kudosReceived ?? []) {
    kudosCountByUser.set(k.to_user_id, (kudosCountByUser.get(k.to_user_id) ?? 0) + 1);
  }

  const memberList = (memberProfiles ?? []).map((p) => ({
    userId: p.id,
    name: p.name || "Adventurer",
    level: p.level,
    currentStreak: streakByUser.get(p.id) ?? 0,
    kudosReceived: kudosCountByUser.get(p.id) ?? 0,
  }));

  // The "shared streak" — the weakest link, on purpose: it only goes up
  // when EVERYONE in the party is keeping their own streak alive, which
  // is what makes it a shared thing to protect rather than one person's
  // number displayed next to others'.
  const sharedStreak = memberList.length > 0 ? Math.min(...memberList.map((m) => m.currentStreak)) : 0;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Party</h1>
      <PartyPanel
        userId={user.id}
        party={
          party
            ? {
                id: party.id,
                name: party.name,
                inviteCode: party.invite_code,
                sharedStreak,
                members: memberList,
              }
            : null
        }
      />
    </div>
  );
}
