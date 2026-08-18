"use client";

import { useEffect } from "react";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { narrate } from "@/lib/audio/narration";

/**
 * Speaks a short bilingual welcome-back line whenever the dashboard
 * mounts — the "guided voice on every step" pass. Renders nothing;
 * purely a side-effect component so the dashboard page itself can stay
 * a server component.
 */
export function DashboardWelcomeVoice({ name }: { name: string }) {
  const { enabled, lang, loaded } = useSoundPreference();

  useEffect(() => {
    if (!loaded) return;
    narrate("dashboardWelcome", enabled, lang, { name });
    // Only re-fire when the preference finishes loading or the name
    // actually changes — not on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return null;
}
