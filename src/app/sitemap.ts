import type { MetadataRoute } from "next";

const SITE_URL = "https://emberss.shop";

/**
 * Generates /sitemap.xml. Only the truly public, unauthenticated
 * routes belong here — /dashboard, /quests, etc. all redirect to
 * /login for a crawler with no session anyway, so listing them would
 * just be noise (or a soft-404 signal) to search engines.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}
