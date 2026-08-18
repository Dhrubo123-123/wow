"use client";

import { useEffect } from "react";
import { Confetti } from "./Confetti";
import { playFanfare, playChime, playClap, speak, vibrate, type VoiceLang } from "@/lib/audio/sound";

export interface CelebrationContent {
  kind: "levelup" | "achievement";
  title: string;
  subtitle?: string;
  voiceLine: string;
}

interface CelebrationOverlayProps {
  content: CelebrationContent | null;
  soundEnabled: boolean;
  voiceLang: VoiceLang;
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
export function CelebrationOverlay({
  content,
  soundEnabled,
  voiceLang,
  onDismiss,
}: CelebrationOverlayProps) {
  useEffect(() => {
    if (!content) return;

    if (content.kind === "levelup") {
      playFanfare(soundEnabled);
      // A layered clap right behind the fanfare's tail is what actually
      // reads as "the room is celebrating with you" instead of just a
      // jingle — brief's "claps + fireworks on earning achievement".
      setTimeout(() => playClap(soundEnabled), 550);
      vibrate([80, 40, 80, 40, 160]);
    } else {
      playChime(soundEnabled);
      playClap(soundEnabled);
      vibrate(120);
    }
    speak(content.voiceLine, soundEnabled, voiceLang);

    const timer = setTimeout(onDismiss, 5200);
    return () => clearTimeout(timer);
  }, [content, soundEnabled, voiceLang, onDismiss]);

  if (!content) return null;

  const isLevelUp = content.kind === "levelup";

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      aria-label="Dismiss celebration"
    >
      <Confetti variant={isLevelUp ? "fireworks" : "confetti"} />
      <div className="relative">
        <div
          className="animate-magic-glow pointer-events-none absolute inset-0 -z-10 rounded-full blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="animate-celebration-pop space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {isLevelUp ? "✨ Level Up ✨" : "🏆 Achievement Unlocked"}
          </p>
          <h2 className="text-gradient-primary text-4xl font-extrabold">{content.title}</h2>
          {content.subtitle && <p className="text-sm text-muted">{content.subtitle}</p>}
          <p className="pt-2 text-xs text-muted">Tap anywhere to continue</p>
        </div>
      </div>
      <p role="status" aria-live="assertive" className="sr-only">
        {isLevelUp ? "Level up! " : "Achievement unlocked! "}
        {content.title}
        {content.subtitle ? `. ${content.subtitle}` : ""}
      </p>
    </div>
  );
}
