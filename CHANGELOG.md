# Changelog

All notable changes are grouped by build phase (see ARCHITECTURE.md §9).

## Phase 1 — Foundation (in progress)

- Scaffolded Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 project.
- Added mobile-first design tokens (dark-first RPG palette) in `globals.css`.
- Built reusable UI components: `Button`, `Card`, `Modal`, `ProgressBar`,
  `Badge`, `Avatar`, `ToastProvider`/`useToast`, `BottomNavigation`.
- Added `AppShell` (phone-width column, bottom nav gating, subtree error
  boundary) and a dependency-free inline icon set.
- Added route-level `error.tsx`, `global-error.tsx`, `loading.tsx`,
  `not-found.tsx` per Phase 24's "no raw stack traces" rule.
- Added placeholder routes: `/dashboard`, `/quests`, `/skills`, `/mentor`,
  `/profile`, `/onboarding` (real data lands in their respective phases).
- Added `manifest.ts` placeholder (full PWA polish in Phase 19).
- Documented the single-smartphone culinary training amendment in
  `ARCHITECTURE.md` §7 for future phases (5, 6, 10, 11, 16).

## Phase 0 — Repository inspection

- Confirmed no existing ASCEND project; initialized a new git repo at
  `~/ascend` per user choice.
