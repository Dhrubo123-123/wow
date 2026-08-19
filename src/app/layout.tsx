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

export const metadata: Metadata = {
  title: "EMBER — Turn Your Real Life Into Quests",
  description:
    "EMBER is an AI-powered real-life RPG. Turn real-world goals into AI-generated quests, submit evidence, and level up.",
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
