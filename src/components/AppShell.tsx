"use client";

import { usePathname } from "next/navigation";
import { BottomNavigation } from "@/components/ui";
import { HomeIcon, QuestIcon, SkillIcon, MentorIcon, ProfileIcon } from "@/components/icons";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalCelebrationListener } from "@/components/celebration/GlobalCelebrationListener";
import { AmbientMusicController } from "@/components/audio/AmbientMusicController";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/quests", label: "Quests", icon: QuestIcon },
  { href: "/skills", label: "Skills", icon: SkillIcon },
  { href: "/mentor", label: "Mentor", icon: MentorIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

// Routes that render their own full-bleed layout without the tab bar
// (auth, onboarding, and the landing page).
const SHELL_EXEMPT_PREFIXES = ["/onboarding", "/login", "/signup"];

/**
 * Mobile-first app shell: constrains content to a phone-width column on
 * larger viewports and reserves space for the fixed bottom nav. Individual
 * route errors are caught by app/error.tsx; this boundary guards against
 * shell-level render failures only.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav =
    pathname !== "/" && !SHELL_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <main className={showNav ? "flex-1 pb-20" : "flex-1"}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      {showNav && <BottomNavigation items={NAV_ITEMS} />}
      {showNav && <GlobalCelebrationListener />}
      {showNav && <AmbientMusicController />}
    </div>
  );
}
