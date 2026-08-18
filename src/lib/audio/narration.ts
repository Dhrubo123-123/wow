"use client";

import { speak, type VoiceLang } from "./sound";

/**
 * Bilingual (English/Hindi) guided-voice lines for the key moments in
 * the core loop — the "magical, hearful voice guided on every step"
 * pass. Kept as a small dictionary + one call site (`narrate`) so every
 * spot in the app that wants a spoken cue goes through the same
 * enabled/language gating instead of re-implementing it.
 */
export type NarrationKey =
  | "dashboardWelcome"
  | "questAccepted"
  | "questStarted"
  | "evidencePrompt"
  | "questSubmitted"
  | "evaluating";

type Vars = Record<string, string | number>;

const LINES: Record<NarrationKey, { en: string; hi: string }> = {
  dashboardWelcome: {
    en: "Welcome back, {name}. Your journey continues.",
    hi: "वापसी पर स्वागत है, {name}। आपकी यात्रा जारी है।",
  },
  questAccepted: {
    en: "Quest accepted. When you're ready, begin your quest.",
    hi: "क्वेस्ट स्वीकार हुआ। जब आप तैयार हों, अपनी यात्रा शुरू करें।",
  },
  questStarted: {
    en: "Your quest has begun. Go earn your evidence.",
    hi: "आपकी यात्रा शुरू हो गई है। जाइए और अपना प्रमाण अर्जित कीजिए।",
  },
  evidencePrompt: {
    en: "Frame your evidence, then tap capture.",
    hi: "अपना प्रमाण फ्रेम करें, फिर कैप्चर पर टैप करें।",
  },
  questSubmitted: {
    en: "Submitted. The Game Master is reviewing your evidence.",
    hi: "जमा हो गया। गेम मास्टर आपका प्रमाण जांच रहा है।",
  },
  evaluating: {
    en: "Hold tight, your quest is being judged.",
    hi: "थोड़ा रुकिए, आपकी यात्रा का मूल्यांकन हो रहा है।",
  },
};

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Speaks a predefined narration line in the user's chosen language. */
export function narrate(key: NarrationKey, enabled: boolean, lang: VoiceLang, vars?: Vars) {
  if (!enabled) return;
  const line = LINES[key];
  if (!line) return;
  speak(interpolate(line[lang], vars), enabled, lang);
}

/** Builds a bilingual celebration line without speaking it immediately. */
export function celebrationLine(
  kind: "levelup" | "achievement",
  lang: VoiceLang,
  detail: { newLevel?: number; achievementName?: string },
): string {
  if (kind === "levelup") {
    return lang === "hi"
      ? `बधाई हो! आप लेवल ${detail.newLevel} पर पहुँच गए हैं।`
      : `Congratulations! You've reached level ${detail.newLevel}.`;
  }
  return lang === "hi"
    ? `उपलब्धि अनलॉक हुई: ${detail.achievementName}।`
    : `Achievement unlocked: ${detail.achievementName}.`;
}
