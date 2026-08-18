"use client";

import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { playChime } from "@/lib/audio/sound";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

/**
 * The one control that gates every sound effect and spoken line in the
 * app (level-up fanfare, achievement chimes, mentor voice) — off by
 * default per the brief, and this is the only place it turns on.
 */
export function SoundToggle() {
  const { enabled, setEnabled, loaded } = useSoundPreference();

  async function toggle() {
    const next = !enabled;
    await setEnabled(next);
    if (next) playChime(true); // immediate feedback that sound just turned on
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sound &amp; Voice</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">
            Level-up fanfare, achievement chimes, and mentor voice
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            checked={enabled}
            disabled={!loaded}
            onChange={toggle}
            className="h-5 w-9 shrink-0 accent-[var(--primary)]"
          />
        </label>
      </CardContent>
    </Card>
  );
}
