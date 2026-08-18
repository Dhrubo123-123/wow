"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VoiceLang } from "./sound";
import type { Json } from "@/lib/supabase/types";

interface StoredSettings {
  ambient_music_enabled?: boolean;
  voice_lang?: VoiceLang;
  [key: string]: unknown;
}

/**
 * Reads/writes `app_settings.sound_enabled` (SFX + voice master switch),
 * plus `app_settings.settings` (a jsonb catch-all already in the schema)
 * for the ambient-music toggle and narration language — no migration
 * needed, this just uses the column that was already provisioned for
 * exactly this kind of addition.
 *
 * Everything defaults to off/English until loaded, matching the brief's
 * "sound only if user enables sound" (never assumed on before we know
 * the user's actual preference).
 */
export function useSoundPreference() {
  const [enabled, setEnabledState] = useState(false);
  const [ambientEnabled, setAmbientEnabledState] = useState(false);
  const [lang, setLangState] = useState<VoiceLang>("en");
  const [loaded, setLoaded] = useState(false);
  const rawSettingsRef = useRef<StoredSettings>({});

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
        .select("sound_enabled, settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        const settings = (data?.settings as StoredSettings) ?? {};
        rawSettingsRef.current = settings;
        setEnabledState(data?.sound_enabled ?? false);
        setAmbientEnabledState(settings.ambient_music_enabled ?? false);
        setLangState(settings.voice_lang ?? "en");
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

  const patchSettings = useCallback(async (patch: Partial<StoredSettings>) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const next = { ...rawSettingsRef.current, ...patch };
    rawSettingsRef.current = next;
    await supabase
      .from("app_settings")
      .upsert({ user_id: user.id, settings: next as unknown as Json }, { onConflict: "user_id" });
  }, []);

  const setAmbientEnabled = useCallback(
    async (value: boolean) => {
      setAmbientEnabledState(value);
      await patchSettings({ ambient_music_enabled: value });
    },
    [patchSettings],
  );

  const setLang = useCallback(
    async (value: VoiceLang) => {
      setLangState(value);
      await patchSettings({ voice_lang: value });
    },
    [patchSettings],
  );

  return {
    enabled,
    setEnabled,
    ambientEnabled,
    setAmbientEnabled,
    lang,
    setLang,
    loaded,
  };
}
