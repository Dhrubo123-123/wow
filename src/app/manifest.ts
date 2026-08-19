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
  };
}
