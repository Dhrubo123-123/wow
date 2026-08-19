"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from "@/components/ui";
import { track } from "@/lib/events/track";
import { EVENT } from "@/lib/events/names";

interface PartyMember {
  userId: string;
  name: string;
  level: number;
  currentStreak: number;
  kudosReceived: number;
}

interface PartyData {
  id: string;
  name: string;
  inviteCode: string;
  sharedStreak: number;
  members: PartyMember[];
}

/** Roadmap item 7 — create/join a party, or view it and send kudos. */
export function PartyPanel({ userId, party }: { userId: string; party: PartyData | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [inviteInput, setInviteInput] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [sendingKudosTo, setSendingKudosTo] = useState<string | null>(null);

  async function createParty() {
    setLoading("create");
    try {
      const res = await fetch("/api/parties/create", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't create a party", description: result.error, variant: "warning" });
        return;
      }
      track(EVENT.PARTY_INVITED, { partyId: result.partyId });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function joinParty() {
    if (!inviteInput.trim()) return;
    setLoading("join");
    try {
      const res = await fetch("/api/parties/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteInput.trim() }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't join", description: result.error, variant: "warning" });
        return;
      }
      toast({ title: "Joined the party! 🎉", variant: "success" });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function sendKudos(toUserId: string) {
    setSendingKudosTo(toUserId);
    try {
      const res = await fetch("/api/parties/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't send kudos", description: result.error, variant: "warning" });
        return;
      }
      toast({ title: "👏 Kudos sent!", variant: "success" });
      router.refresh();
    } finally {
      setSendingKudosTo(null);
    }
  }

  async function copyInviteLink() {
    if (!party) return;
    await navigator.clipboard.writeText(party.inviteCode);
    toast({ title: "Invite code copied", description: "Share it with a friend to team up." });
  }

  if (!party) {
    return (
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Start a party</CardTitle>
            <CardDescription>Team up with a friend and keep each other&apos;s streaks alive.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button fullWidth loading={loading === "create"} onClick={createParty}>
              Create a party
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join a party</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Invite code"
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
            />
            <Button fullWidth variant="secondary" loading={loading === "join"} onClick={joinParty}>
              Join
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{party.name}</p>
            <p className="text-xs text-muted">Invite code: {party.inviteCode}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={copyInviteLink}>
            Copy code
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-2">
          <span className="animate-flame-flicker" aria-hidden="true">
            🔥
          </span>
          <div>
            <p className="text-sm font-medium">{party.sharedStreak} day shared streak</p>
            <p className="text-xs text-muted">The lowest of everyone&apos;s streaks — protect it together.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {party.members.map((member) => (
          <Card key={member.userId}>
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>Level {member.level}</Badge>
                  <Badge variant="accent">🔥 {member.currentStreak}</Badge>
                  {member.kudosReceived > 0 && <Badge>👏 {member.kudosReceived}</Badge>}
                </div>
              </div>
              {member.userId !== userId && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={sendingKudosTo === member.userId}
                  onClick={() => sendKudos(member.userId)}
                >
                  👏 Kudos
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
