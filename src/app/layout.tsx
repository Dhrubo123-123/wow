import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import { AppShell } from "@/components/AppShell";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { EmberField } from "@/components/branding/EmberField";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Headings-only display face — an engraved, epic-seal serif (matches
// the emblem's "old coin" styling) so headings actually look designed
// instead of just being the body font at a bigger weight. Body copy
// stays on Geist Sans for readability at small sizes; this is a
// heading-only accent, not a full font swap.
const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

const SITE_URL = "https://emberss.shop";
const SITE_DESCRIPTION =
  "EMBER turns your real-life goals into AI-generated quests. Submit evidence, get evaluated by an AI Game Master, earn XP, level up, and unlock skills — a real-life RPG for cooking, fitness, learning, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EMBER — Turn Your Real Life Into Quests",
    template: "%s · EMBER",
  },
  description: SITE_DESCRIPTION,
  applicationName: "EMBER",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EMBER",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Explicit, not assumed — the default without this is "index, follow",
  // but stating it plainly (plus the granular googleBot block) means a
  // crawler never has to guess intent from an unauthenticated app that
  // gates most of its routes behind login.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  keywords: [
    "real life RPG",
    "AI quests",
    "gamified self improvement",
    "habit tracker RPG",
    "AI goal tracker",
    "AI life coach app",
    "level up real life",
    "quest based productivity",
  ],
  authors: [{ name: "EMBER" }],
  category: "productivity",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "EMBER",
    title: "EMBER — Turn Your Real Life Into Quests",
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "EMBER — AI-Powered Real-Life RPG" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EMBER — Turn Your Real Life Into Quests",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05061a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <EmberField />
        <ToastProvider>
          <AppShell>{children}</AppShell>
          <PWAProvider />
        </ToastProvider>
      </body>
    </html>
  );
}
