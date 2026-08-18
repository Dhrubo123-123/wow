"use client";

import { useEffect } from "react";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { startAmbientMusic, stopAmbientMusic } from "@/lib/audio/ambient";

/**
 * Mounted once in AppShell, mirroring GlobalCelebrationListener. Starts
 * or stops the generative ambient loop (`lib/audio/ambient.ts`) based on
 * the user's saved preference, and pauses it when the tab isn't visible
 * so it doesn't keep synthesizing audio nobody can hear in the
 * background.
 */
export function AmbientMusicController() {
  const { ambientEnabled, loaded } = useSoundPreference();

  useEffect(() => {
    if (!loaded) return;
    if (ambientEnabled && !document.hidden) {
      startAmbientMusic();
    } else {
      stopAmbientMusic();
    }
  }, [ambientEnabled, loaded]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        stopAmbientMusic();
      } else if (ambientEnabled) {
        startAmbientMusic();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [ambientEnabled]);

  // Belt-and-suspenders: always stop on unmount.
  useEffect(() => stopAmbientMusic, []);

  return null;
}
