import type { MetadataRoute } from "next";

const SITE_URL = "https://emberss.shop";

/**
 * Generates /robots.txt. Every crawler is explicitly welcomed at the
 * public routes and pointed at the sitemap — the app's actual content
 * (dashboard, quests, etc.) is behind auth and RLS anyway, so there's
 * nothing sensitive to accidentally expose by allowing broad crawl;
 * the goal here is purely "don't be invisible."
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/quests", "/skills", "/mentor", "/profile", "/onboarding", "/settings/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
