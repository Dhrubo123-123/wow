"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, useToast } from "@/components/ui";
import { CameraCapture } from "@/components/camera/CameraCapture";
import type { EvidenceType, QuestStatus } from "@/lib/quests";

interface QuestActionsProps {
  questId: string;
  userId: string;
  status: QuestStatus;
  attemptId: string | null;
  evidenceType: EvidenceType | null;
}

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024; // matches the storage bucket's file_size_limit (Phase 13)

/**
 * Drives the quest lifecycle a user is allowed to progress themselves —
 * available → accepted → in_progress → submitted (brief §17/Phase 9).
 * Everything past `submitted` (under_review → completed/failed) happens
 * server-side after AI evaluation (Phase 14), so there's no action here
 * for those states.
 *
 * Image evidence uploads to the private `quest-evidence` Storage bucket
 * (Phase 13); every other evidence_type still falls back to a text
 * description — url/file capture UIs don't exist yet, and a caption is
 * required either way since neither AI provider here does vision input,
 * so the model needs *something* textual to evaluate regardless of what
 * media was attached.
 */
export function QuestActions({ questId, userId, status, attemptId, evidenceType }: QuestActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isImageEvidence = evidenceType === "image";

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

    if (photo && photo.size > MAX_EVIDENCE_BYTES) {
      setError("That photo is too large (max 10 MB). Please retake it.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    let storagePath: string | null = null;
    if (photo) {
      const path = `${userId}/${attemptId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("quest-evidence")
        .upload(path, photo, { contentType: "image/jpeg" });

      if (uploadError) {
        setLoading(false);
        setError("Something went wrong uploading your photo. Please try again.");
        return;
      }
      storagePath = path;
    }

    const { error: evidenceError } = await supabase.from("quest_evidence").insert({
      quest_attempt_id: attemptId,
      user_id: userId,
      evidence_type: storagePath ? "image" : "text",
      content: caption,
      storage_path: storagePath,
      mime_type: storagePath ? "image/jpeg" : null,
      size_bytes: photo?.size ?? null,
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

    if (attemptError || questError) {
      setLoading(false);
      setError("Something went wrong. Please try again.");
      return;
    }

    toast({ title: "Submitted!", description: "The Game Master is reviewing your evidence…" });

    // Phase 14: evaluate immediately rather than leaving the user
    // waiting on a background job — this is what actually closes the
    // GOAL -> QUEST -> ... -> XP -> LEVEL UP loop from §1 of the brief.
    try {
      const res = await fetch(`/api/quests/${questId}/evaluate`, { method: "POST" });
      const result = await res.json();

      if (!res.ok) {
        toast({
          title: "Review delayed",
          description: result.error ?? "Your submission is saved — try refreshing shortly.",
          variant: "warning",
        });
      } else {
        toast({
          title: result.passed ? "Quest complete! 🎉" : "Not quite there yet",
          description: result.feedback,
          variant: result.passed ? "success" : "warning",
        });
        // Stagger level-up + achievement celebrations so they queue
        // one after another instead of one immediately replacing the
        // other (CelebrationOverlay shows a single moment at a time).
        let delay = 0;
        if (result.leveledUp) {
          window.dispatchEvent(
            new CustomEvent("ascend:levelup", { detail: { newLevel: result.newLevel } }),
          );
          delay += 5500;
        }
        for (const achievement of result.newAchievements ?? []) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("ascend:achievement", {
                detail: { name: achievement.name, description: achievement.description },
              }),
            );
          }, delay);
          delay += 5500;
        }
      }
    } catch {
      toast({
        title: "Review delayed",
        description: "Your submission is saved — try refreshing shortly.",
        variant: "warning",
      });
    }

    setLoading(false);
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
        {isImageEvidence && !photo && (
          <CameraCapture onCapture={setPhoto} />
        )}

        {isImageEvidence && photo && (
          <div className="space-y-2">
            <p className="text-xs text-success">Photo captured ✓</p>
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="text-xs text-muted hover:text-foreground"
            >
              Retake
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="evidence" className="text-sm font-medium">
            {isImageEvidence ? "Add a caption" : "Describe what you did"}
            {evidenceType && evidenceType !== "text" && evidenceType !== "image" && (
              <span className="ml-1 text-xs text-muted">
                (file/url capture lands in a later phase — text for now)
              </span>
            )}
          </label>
          <textarea
            id="evidence"
            required
            rows={4}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What did you do, and how does it meet the success criteria?"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          type="submit"
          fullWidth
          loading={loading}
          disabled={isImageEvidence && !photo}
        >
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
