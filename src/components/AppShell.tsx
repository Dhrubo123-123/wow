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
    // Deliberately no solid background here — this used to be opaque
    // `bg-background`, which painted over both the ambient gradient glow
    // (defined on <body>) and the EmberField particle layer on every
    // logged-in page, the actual reason the app felt flat past login
    // while the landing page (which skips AppShell) didn't. `relative
    // z-10` just lifts real content above the fixed EmberField layer.
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col">
      <main className={showNav ? "flex-1 pb-20" : "flex-1"}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      {showNav && <BottomNavigation items={NAV_ITEMS} />}
      {showNav && <GlobalCelebrationListener />}
      {showNav && <AmbientMusicController />}
    </div>
  );
}
