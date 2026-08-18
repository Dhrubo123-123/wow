"use client";

import { useEffect } from "react";
import { Confetti } from "./Confetti";
import { playFanfare, playChime, speak, vibrate } from "@/lib/audio/sound";

export interface CelebrationContent {
  kind: "levelup" | "achievement";
  title: string;
  subtitle?: string;
  voiceLine: string;
}

interface CelebrationOverlayProps {
  content: CelebrationContent | null;
  soundEnabled: boolean;
  onDismiss: () => void;
}

/**
 * Full-screen celebratory moment (brief §15: level-up animation +
 * vibration + opt-in sound + accessible announcement). Shared between
 * Phase 15 (level-up) and Phase 17 (achievements) so the effect —
 * confetti, sound, voice, vibration — is defined exactly once.
 *
 * The aria-live announcement always fires, regardless of the sound
 * toggle — that's an accessibility requirement, not a "sound".
 */
export function CelebrationOverlay({ content, soundEnabled, onDismiss }: CelebrationOverlayProps) {
  useEffect(() => {
    if (!content) return;

    if (content.kind === "levelup") {
      playFanfare(soundEnabled);
      vibrate([80, 40, 80, 40, 160]);
    } else {
      playChime(soundEnabled);
      vibrate(120);
    }
    speak(content.voiceLine, soundEnabled);

    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [content, soundEnabled, onDismiss]);

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      aria-label="Dismiss celebration"
    >
      <Confetti />
      <div className="animate-celebration-pop space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          {content.kind === "levelup" ? "Level Up" : "Achievement Unlocked"}
        </p>
        <h2 className="text-gradient-primary text-4xl font-extrabold">{content.title}</h2>
        {content.subtitle && <p className="text-sm text-muted">{content.subtitle}</p>}
        <p className="pt-2 text-xs text-muted">Tap anywhere to continue</p>
      </div>
      <p role="status" aria-live="assertive" className="sr-only">
        {content.kind === "levelup" ? "Level up! " : "Achievement unlocked! "}
        {content.title}
        {content.subtitle ? `. ${content.subtitle}` : ""}
      </p>
    </div>
  );
}
