import type { MetadataRoute } from "next";

/**
 * Phase 19 — full PWA manifest. Icons are real generated PNGs
 * (public/icons/), not placeholders — see ARCHITECTURE.md §11 for how
 * they were produced (Pillow, since no SVG rasterizer was available in
 * this environment).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EMBER — AI-Powered Real-Life RPG",
    short_name: "EMBER",
    description: "Turn your real life into quests.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05061a",
    theme_color: "#05061a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Roadmap item 3 — long-press the home-screen icon and go straight
    // to today's quest (which itself opens on the evidence-capture
    // step, see /quests/today's redirect target), skipping the app
    // shell entirely. "shortcuts" only shows on platforms that support
    // it (Android/desktop Chrome); it's a no-op elsewhere, not a
    // requirement.
    shortcuts: [
      {
        name: "Today's Quest",
        short_name: "Quest",
        description: "Jump straight to today's quest and evidence camera.",
        url: "/quests/today",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
