"use client";

import { useCallback, useEffect, useState } from "react";
import { CelebrationOverlay, type CelebrationContent } from "./CelebrationOverlay";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";

interface LevelUpDetail {
  newLevel: number;
}

interface AchievementDetail {
  name: string;
  description?: string;
}

/**
 * Mounted once in AppShell. Listens for the window events other parts
 * of the app dispatch on a celebratory moment — decoupled on purpose so
 * e.g. QuestActions (Phase 14) doesn't need to import UI/audio code
 * directly, it just fires `ascend:levelup` and moves on.
 */
export function GlobalCelebrationListener() {
  const { enabled: soundEnabled } = useSoundPreference();
  const [content, setContent] = useState<CelebrationContent | null>(null);

  const dismiss = useCallback(() => setContent(null), []);

  useEffect(() => {
    function onLevelUp(e: Event) {
      const detail = (e as CustomEvent<LevelUpDetail>).detail;
      if (!detail?.newLevel) return;
      setContent({
        kind: "levelup",
        title: `Level ${detail.newLevel}`,
        subtitle: "New quests unlocked",
        voiceLine: `Congratulations! You've reached level ${detail.newLevel}.`,
      });
    }

    function onAchievement(e: Event) {
      const detail = (e as CustomEvent<AchievementDetail>).detail;
      if (!detail?.name) return;
      setContent({
        kind: "achievement",
        title: detail.name,
        subtitle: detail.description,
        voiceLine: `Achievement unlocked: ${detail.name}.`,
      });
    }

    window.addEventListener("ascend:levelup", onLevelUp);
    window.addEventListener("ascend:achievement", onAchievement);
    return () => {
      window.removeEventListener("ascend:levelup", onLevelUp);
      window.removeEventListener("ascend:achievement", onAchievement);
    };
  }, []);

  return <CelebrationOverlay content={content} soundEnabled={soundEnabled} onDismiss={dismiss} />;
}
