"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, useToast } from "@/components/ui";
import type { EvidenceType, QuestStatus } from "@/lib/quests";

interface QuestActionsProps {
  questId: string;
  userId: string;
  status: QuestStatus;
  attemptId: string | null;
  evidenceType: EvidenceType | null;
}

/**
 * Drives the quest lifecycle a user is allowed to progress themselves —
 * available → accepted → in_progress → submitted (brief §17/Phase 9).
 * Everything past `submitted` (under_review → completed/failed) happens
 * server-side after AI evaluation (Phase 14), so there's no action here
 * for those states.
 *
 * Camera/image evidence capture is Phase 10; for now every evidence_type
 * falls back to a text description, which is honest about what's
 * actually implemented rather than showing a capture UI that doesn't work.
 */
export function QuestActions({ questId, userId, status, attemptId, evidenceType }: QuestActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("quests")
      .update({ status: "accepted" })
      .eq("id", questId);
    setLoading(false);
    if (err) {
      setError("Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  async function start() {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error: attemptError } = await supabase
      .from("quest_attempts")
      .insert({ quest_id: questId, user_id: userId, status: "in_progress" });

    if (attemptError) {
      setLoading(false);
      setError("Something went wrong. Please try again.");
      return;
    }

    const { error: questError } = await supabase
      .from("quests")
      .update({ status: "in_progress" })
      .eq("id", questId);

    setLoading(false);
    if (questError) {
      setError("Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error: evidenceError } = await supabase.from("quest_evidence").insert({
      quest_attempt_id: attemptId,
      user_id: userId,
      evidence_type: "text",
      content: evidence,
    });

    if (evidenceError) {
      setLoading(false);
      setError("Something went wrong. Please try again.");
      return;
    }

    const { error: attemptError } = await supabase
      .from("quest_attempts")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", attemptId);

    const { error: questError } = await supabase
      .from("quests")
      .update({ status: "submitted" })
      .eq("id", questId);

    setLoading(false);

    if (attemptError || questError) {
      setError("Something went wrong. Please try again.");
      return;
    }

    toast({ title: "Submitted!", description: "Your evidence is awaiting review." });
    router.refresh();
  }

  if (status === "available") {
    return (
      <div className="space-y-2">
        <Button fullWidth loading={loading} onClick={accept}>
          Accept Quest
        </Button>
        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="space-y-2">
        <Button fullWidth loading={loading} onClick={start}>
          Start Quest
        </Button>
        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="evidence" className="text-sm font-medium">
            Describe what you did
            {evidenceType && evidenceType !== "text" && (
              <span className="ml-1 text-xs text-muted">
                (photo/file/url evidence lands in Phase 10/13 — text for now)
              </span>
            )}
          </label>
          <textarea
            id="evidence"
            required
            rows={4}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="What did you do, and how does it meet the success criteria?"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" fullWidth loading={loading}>
          Submit for Review
        </Button>
      </form>
    );
  }

  if (status === "submitted" || status === "under_review") {
    return (
      <p className="rounded-md border border-border bg-surface-raised p-3 text-center text-sm text-muted">
        Submitted — awaiting review.
      </p>
    );
  }

  return null;
}
