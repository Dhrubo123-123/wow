"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardContent, useToast } from "@/components/ui";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { Confetti } from "@/components/celebration/Confetti";
import { LogoMark } from "@/components/branding/Logo";
import { playFanfare, playClap, speak, vibrate } from "@/lib/audio/sound";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { track } from "@/lib/events/track";
import { EVENT } from "@/lib/events/names";
import { GOAL_CATEGORIES, STARTER_QUESTS, type GoalCategory, type StarterQuest } from "@/lib/onboarding/starterQuests";

type Step = "category" | "quest" | "celebrating" | "schedule" | "sealed";

const TIME_OPTIONS = [
  { label: "Early morning", value: "06:30" },
  { label: "Morning", value: "08:30" },
  { label: "Lunch", value: "12:30" },
  { label: "Evening", value: "18:30" },
  { label: "Night", value: "21:00" },
];

/**
 * Retention roadmap item 2 — the day-one guaranteed win. Replaces the
 * old free-text-form onboarding: tap a category, get a real (zero-AI,
 * deterministically-evaluated) starter quest, complete it, watch XP
 * land and a skill node light up, all inside the first few minutes —
 * then account creation happens LAST, not first, via Supabase
 * anonymous auth converted in place (lib/supabase/client's session
 * carries straight through `auth.updateUser`, so the XP/streak/
 * achievements already earned survive the conversion instead of being
 * created under a throwaway identity and lost).
 */
export function DayOneFlow() {
  const router = useRouter();
  const { toast } = useToast();
  const { enabled: soundEnabled, lang } = useSoundPreference();

  const [step, setStep] = useState<Step>("category");
  const [quest, setQuest] = useState<{ id: string } | null>(null);
  const [template, setTemplate] = useState<StarterQuest | null>(null);
  const [textEvidence, setTextEvidence] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ xp: number; leveledUp: boolean; newLevel: number | null } | null>(
    null,
  );
  const [preferredTime, setPreferredTime] = useState("08:30");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [converting, setConverting] = useState(false);
  const sessionReady = useRef(false);

  // Establish a session — anonymous if there isn't one already, so
  // every write from here on has a real auth.uid() to attach to. Real
  // (already-signed-up) users landing here just keep their own session.
  useEffect(() => {
    if (sessionReady.current) return;
    sessionReady.current = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.user) {
          setError("Couldn't start your session. Please refresh and try again.");
          return;
        }
        setIsAnonymous(true);
      } else {
        setIsAnonymous(user.is_anonymous ?? false);
      }
    })();
  }, []);

  async function chooseCategory(value: GoalCategory) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setQuest(data.quest);
      setTemplate(STARTER_QUESTS[value]);
      setStep("quest");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitStarterQuest() {
    if (!quest || !template) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      let storagePath: string | null = null;

      if (template.evidenceType === "image" && photo) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const path = `${user?.id}/starter/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("quest-evidence")
          .upload(path, photo, { contentType: "image/jpeg" });
        if (uploadError) {
          setError("Photo upload failed. Please try again.");
          setLoading(false);
          return;
        }
        storagePath = path;
      }

      const res = await fetch("/api/onboarding/complete-starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questId: quest.id,
          evidenceType: template.evidenceType,
          content: template.evidenceType === "text" ? textEvidence : undefined,
          storagePath: storagePath ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      track(EVENT.EVIDENCE_SUBMITTED, { questId: quest.id, starter: true });
      setCelebration({ xp: data.xpAwarded, leveledUp: data.leveledUp, newLevel: data.newLevel });
      setStep("celebrating");
      playFanfare(soundEnabled);
      setTimeout(() => playClap(soundEnabled), 500);
      vibrate([80, 40, 80, 40, 160]);
      speak(
        lang === "hi"
          ? `बधाई हो! आपने अपना पहला एम्बर जलाया है। आप लेवल ${data.newLevel} पर पहुँच गए हैं।`
          : `Congratulations! You've lit your first ember. You've reached level ${data.newLevel}.`,
        soundEnabled,
        lang,
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSchedule() {
    setLoading(true);
    try {
      await fetch("/api/onboarding/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredQuestTime: preferredTime }),
      });
    } catch {
      // Non-fatal — the countdown screen still works with a default time.
    } finally {
      setLoading(false);
      setStep("sealed");
    }
  }

  async function convertAccount(e: React.FormEvent) {
    e.preventDefault();
    setConverting(true);
    setError(null);
    try {
      const supabase = createClient();
      // The key move: updateUser on the SAME (anonymous) session turns
      // it into a real account in place — same auth.uid(), so every
      // row already written (profile, goal, quest, XP, streak,
      // achievements, events) stays attached to this user, nothing is
      // recreated or lost.
      const { error: updateError } = await supabase.auth.updateUser({ email, password });
      if (updateError) {
        setError(updateError.message || "Something went wrong. Please try again.");
        setConverting(false);
        return;
      }
      await supabase.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).then(() => {});
      track(EVENT.ONBOARDING_COMPLETED, {});
      toast({ title: "Account saved!", description: "Check your email to confirm, then you're all set." });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setConverting(false);
    }
  }

  async function finishWithoutConverting() {
    const supabase = createClient();
    await supabase.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).then(() => {});
    track(EVENT.ONBOARDING_COMPLETED, {});
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      {step === "category" && (
        <div className="stagger-children space-y-5 text-center">
          <LogoMark size={64} className="mx-auto" />
          <div>
            <h1 className="font-display text-2xl font-bold">What are you here to build?</h1>
            <p className="mt-1 text-sm text-muted">
              Pick one — you&apos;ll be doing your first real quest in the next 3 minutes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GOAL_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={loading}
                onClick={() => chooseCategory(c.value)}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-raised p-4 text-sm font-medium transition-colors hover:border-primary/50 disabled:opacity-50"
              >
                <span className="text-2xl">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {step === "quest" && template && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-accent">Your first quest</p>
            <h1 className="font-display text-xl font-bold">{template.title}</h1>
            <p className="mt-1 text-sm text-muted">{template.objective}</p>
          </div>
          <Card>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">Instructions</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                {template.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {template.evidenceType === "image" ? (
            photo ? (
              <div className="space-y-2">
                <p className="text-center text-xs text-success">Photo captured ✓</p>
                <Button variant="secondary" fullWidth onClick={() => setPhoto(null)}>
                  Retake
                </Button>
              </div>
            ) : (
              <CameraCapture onCapture={setPhoto} />
            )
          ) : (
            <textarea
              value={textEvidence}
              onChange={(e) => setTextEvidence(e.target.value)}
              placeholder={template.evidencePrompt}
              rows={3}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          )}

          {error && <p className="text-center text-sm text-danger">{error}</p>}
          <Button
            fullWidth
            loading={loading}
            disabled={template.evidenceType === "image" ? !photo : textEvidence.trim().length < 8}
            onClick={submitStarterQuest}
          >
            Prove it
          </Button>
        </div>
      )}

      {step === "celebrating" && celebration && (
        <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <Confetti variant="fireworks" />
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">First Ember lit</p>
          <h1 className="text-gradient-primary font-display text-4xl font-extrabold">+{celebration.xp} XP</h1>
          {celebration.leveledUp && (
            <p className="text-lg font-bold">Level {celebration.newLevel} reached!</p>
          )}
          <p className="text-sm text-muted">You just proved something real can start here.</p>
          <Button size="lg" onClick={() => setStep("schedule")}>
            Keep going
          </Button>
        </div>
      )}

      {step === "schedule" && (
        <div className="space-y-5 text-center">
          <h1 className="font-display text-xl font-bold">When do you usually have time for this?</h1>
          <p className="text-sm text-muted">
            We&apos;ll unlock your next quest at the same time every day — the routine is the point.
          </p>
          {/* Roadmap item 4 — the schedule step IS the commitment; the
              copy should name that instead of reading like a generic
              form field. */}
          <p className="text-xs font-medium text-accent">
            Pick a time and we&apos;ll hold you to it, gently.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {TIME_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPreferredTime(t.value)}
                aria-pressed={preferredTime === t.value}
                className={`rounded-md border px-4 py-2.5 text-sm ${
                  preferredTime === t.value
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-surface-raised text-muted"
                }`}
              >
                {t.label} · {t.value}
              </button>
            ))}
          </div>
          <Button fullWidth loading={loading} onClick={saveSchedule}>
            Commit to this time
          </Button>
        </div>
      )}

      {step === "sealed" && (
        <div className="space-y-5 text-center">
          <div className="rounded-lg border border-accent/40 bg-surface-raised p-6">
            <p className="text-4xl">📜</p>
            <p className="mt-2 font-display text-lg font-bold">Tomorrow&apos;s quest is sealed</p>
            <p className="mt-1 text-sm text-muted">
              Opens at {preferredTime}. Come back and break the seal.
            </p>
          </div>

          {isAnonymous ? (
            <form onSubmit={convertAccount} className="space-y-3 text-left">
              <p className="text-center text-sm font-medium">Save your progress — create your account</p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              {error && <p className="text-center text-sm text-danger">{error}</p>}
              <Button type="submit" fullWidth loading={converting}>
                Save my Ember
              </Button>
              <button
                type="button"
                onClick={finishWithoutConverting}
                className="w-full text-center text-xs text-muted hover:text-foreground"
              >
                Continue without saving (progress may be lost)
              </button>
            </form>
          ) : (
            <Button fullWidth onClick={finishWithoutConverting}>
              Go to my dashboard
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
