"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Reads/writes `app_settings.sound_enabled` — the single source of
 * truth for whether any of lib/audio/sound.ts may actually play
 * anything. Defaults to `false` until loaded, matching the brief's
 * "sound only if user enables sound" (never on by default, and never
 * assumed on while we don't yet know the user's preference).
 */
export function useSoundPreference() {
  const [enabled, setEnabledState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("app_settings")
        .select("sound_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setEnabledState(data?.sound_enabled ?? false);
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    setEnabledState(value);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("app_settings")
      .upsert({ user_id: user.id, sound_enabled: value }, { onConflict: "user_id" });
  }, []);

  return { enabled, setEnabled, loaded };
}
