# Changelog

All notable changes are grouped by build phase (see ARCHITECTURE.md §9).

## Phase 6 — AI provider

- Added `lib/ai/schemas.ts`: Zod schemas for the four AI JSON contracts
  (`QuestGenerationSchema`, `AIEvaluationSchema`, `GoalPlanSchema`,
  `MentorResponseSchema`, `DifficultyAdjustmentSchema`), matching brief
  §14/§23 exactly.
- Added `lib/ai/types.ts`: the `AIProvider` interface (`generateQuest`,
  `evaluateQuest`, `generateGoalPlan`, `generateMentorResponse`,
  `adjustDifficulty`) and `AIProviderError` — the controlled error type
  for Phase 24's "GAME MASTER TEMPORARILY UNAVAILABLE" messaging.
- Added `lib/ai/providers/openai-compatible.ts`: shared implementation
  (request plumbing + retry-once-then-controlled-error schema
  validation) for any Chat-Completions-shaped provider — Cerebras and
  Groq are both thin subclasses, avoiding duplicated AI logic.
- Added `CerebrasProvider`, `GroqProvider` (temporary fallback — see
  ARCHITECTURE.md §10), and `MockAIProvider` (deterministic, no network,
  for local dev/Phase 23 tests).
- Added `lib/ai/index.ts`'s `getAIProvider()` factory, selectable via
  `AI_PROVIDER` env var.
- **Cerebras account is blocked** (402 payment_required on every model,
  even free ones — no payment method on file). Verified real AI calls
  end-to-end via Groq hosting the identical `openai/gpt-oss-120b` model:
  quest generation and evidence evaluation both returned schema-valid,
  high-quality output on the first attempt. Full details and the
  one-line switch-back instructions are in ARCHITECTURE.md §10.

## Phase 5 — Quest data model

- Added `lib/quests/types.ts`: `Quest`/`QuestAttempt`/`QuestEvidence`
  row types (derived from the Phase 2 DB types), `QuestDifficulty`
  (1-5) with labels, and `QuestGenerationInput` — the shape the AI
  provider must produce in Phase 6/14, kept next to the domain model so
  the two can't silently drift apart.
- Added `lib/quests/transitions.ts`: the quest lifecycle
  (`available → accepted → in_progress → submitted → under_review →
  completed/failed`) and quest-attempt lifecycle
  (`in_progress → submitted → completed/failed`) as an explicit
  transition graph, plus `USER_SETTABLE_QUEST_STATUSES` mirroring the
  RLS check constraint from Phase 2's migration. Sanity-checked the
  graph logic (legal transitions pass, illegal skips/reversals rejected).

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
