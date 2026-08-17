import type { MetadataRoute } from "next";

/**
 * Minimal placeholder manifest so the browser's manifest fetch doesn't
 * 404 during Phase 1. Icons, screenshots, and install-prompt polish are
 * implemented in Phase 19 (PWA).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ASCEND — AI-Powered Real-Life RPG",
    short_name: "ASCEND",
    description: "Turn your real life into quests.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#05061a",
    theme_color: "#05061a",
    icons: [],
  };
}
