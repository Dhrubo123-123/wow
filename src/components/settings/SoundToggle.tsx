"use client";

import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { playChime } from "@/lib/audio/sound";
import { startAmbientMusic, stopAmbientMusic } from "@/lib/audio/ambient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { VoiceLang } from "@/lib/audio/sound";

/**
 * The control panel that gates every sound effect, ambient music loop,
 * and spoken line in the app — off by default per the brief, and this
 * is the only place any of it turns on. Three independent switches:
 *   - Sound effects & voice: fanfare/chime/claps + all narration
 *   - Ambient music: the generative background loop (lib/audio/ambient.ts)
 *   - Voice language: which language narration/celebration lines speak in
 */
export function SoundToggle() {
  const { enabled, setEnabled, ambientEnabled, setAmbientEnabled, lang, setLang, loaded } =
    useSoundPreference();

  async function toggleSound() {
    const next = !enabled;
    await setEnabled(next);
    if (next) playChime(true); // immediate feedback that sound just turned on
  }

  async function toggleAmbient() {
    const next = !ambientEnabled;
    await setAmbientEnabled(next);
    // Give instant feedback rather than waiting for AmbientMusicController's
    // effect to re-run — this is a direct user gesture, the best place to
    // actually kick off an AudioContext if one doesn't exist yet.
    if (next) startAmbientMusic();
    else stopAmbientMusic();
  }

  async function changeLang(next: VoiceLang) {
    await setLang(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sound &amp; Voice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">
            Level-up fanfare, achievement chimes &amp; claps, and mentor voice
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            checked={enabled}
            disabled={!loaded}
            onChange={toggleSound}
            className="h-5 w-9 shrink-0 accent-[var(--primary)]"
          />
        </label>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">
            ✨ Magical ambient music (generative, plays softly in the background)
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={ambientEnabled}
            checked={ambientEnabled}
            disabled={!loaded}
            onChange={toggleAmbient}
            className="h-5 w-9 shrink-0 accent-[var(--primary)]"
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm text-muted">Guided voice language</span>
          <div className="flex gap-2">
            {(
              [
                { value: "en" as const, label: "English" },
                { value: "hi" as const, label: "हिन्दी (Hindi)" },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!loaded}
                onClick={() => changeLang(option.value)}
                aria-pressed={lang === option.value}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  lang === option.value
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
