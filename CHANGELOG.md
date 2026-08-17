# Changelog

All notable changes are grouped by build phase (see ARCHITECTURE.md §9).

## Phase 4 — XP engine

- Added `lib/progression/levels.ts`: deterministic `calculateXPForLevel`,
  `calculateTotalXPForLevel`, `calculateLevel`, `calculateProgress`,
  `xpForNextLevel` — no AI, no randomness. Curve: level N needs
  `100 + (N-1)*50` XP over the previous level.
- Added `lib/progression/xp.ts`: `awardXP()` writes an immutable
  `xp_transactions` ledger row before updating the `profiles.xp/level`
  cache — never overwrites XP without recording the event, per the
  brief. Verified against the live DB via a temporary dev-only API route
  (removed after verification): 0→120 XP correctly produced level 1→2.
- Added `lib/progression/skills.ts` (`updateSkillXP`, mastery level from
  skill-specific XP) and `lib/progression/achievements.ts`
  (`unlockAchievement`, idempotent via the DB's unique constraint —
  a 23505 conflict is treated as "already granted", not an error).
- All three DB-writing modules are `server-only` and take an admin
  (service-role) client — they bypass RLS, which is intentional per
  Phase 2's "xp_transactions has no user insert policy" design.

## Phase 3 — Profile/Onboarding

- Built `/onboarding`: real form (name, preferred language, occupation,
  primary objective, first goal, timeframe, skill level) that creates a
  `goals` row and updates the caller's `profiles` row (name, language,
  occupation, primary_objective, current_goal_id,
  onboarding_completed_at) via the browser Supabase client — RLS's
  `auth.uid() = user_id`/`= id` policies allow this without any
  server-side code. Skips straight to `/dashboard` if onboarding is
  already complete.
- Fixed a gap where a confirmed user logging in without having finished
  onboarding landed on the dashboard placeholder instead of
  `/onboarding` — `/login` now checks `profiles.onboarding_completed_at`
  after sign-in and redirects accordingly.
- `/profile` now renders real data: name, avatar (initials fallback),
  level badge, XP progress bar (via the new progression lib), occupation
  and language badges, streak count, and the current goal — redirects to
  `/onboarding` if it isn't finished yet.
- Verified end-to-end in-browser: signup → confirm → login → onboarding
  form submit → dashboard → profile showing the submitted data.

## Phase 2 — Supabase (auth, schema, RLS)

- Created the `ascend-production` Supabase project (Asia-Pacific/Tokyo),
  connected to the `Dhrubo123-123/wow` GitHub repo.
- Wrote `supabase/migrations/0001_init.sql`: all 16 required tables
  (profiles, goals, skills, user_skills, quests, quest_attempts,
  quest_evidence, xp_transactions, levels, achievements,
  user_achievements, streaks, ai_evaluations, ai_messages,
  device_permissions, app_settings) with RLS enabled and policies scoped
  to `auth.uid()`. Config tables (skills/levels/achievements) are
  read-only for authenticated users; XP transactions and AI evaluations
  are server-written only (service role), matching Phase 4/14's "server
  independently enforces XP limits" rule. Applied directly via the SQL
  Editor — verified all 16 tables exist with `rowsecurity = true`.
- Added a `handle_new_user` trigger that auto-creates a `profiles` row on
  signup — verified end-to-end with a real signup.
- Added `lib/supabase/{client,server,admin,proxy}.ts` (browser, Server
  Component, service-role-admin, and session-refresh clients) and
  hand-written `lib/supabase/types.ts` Database types.
- Migrated `middleware.ts` → `proxy.ts` per Next.js 16's renamed
  convention; protects all routes except `/`, `/login`, `/signup`, and
  auth/manifest/static assets, redirecting unauthenticated users to
  `/login?next=...`.
- Built `/signup`, `/login`, `/api/auth/callback` (email-confirmation
  redirect handler), and a logout button on `/profile`. Verified signup →
  confirmation email → profile auto-creation, and protected-route
  redirect, against the live project.
- Wrote Supabase URL/keys and the Cerebras key to `.env.local`
  (untracked; `.gitignore`'s `.env*` rule was fixed to still allow
  `.env.example` to be committed).
- Redesigned the color system: deep indigo-navy background, an electric
  indigo→cyan gradient for primary actions/headline (replacing the flat
  dark-violet palette), ambient radial-gradient background glow, and
  glow shadows on primary buttons. Gold retained for XP/reward moments.

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
