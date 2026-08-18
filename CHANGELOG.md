# Changelog

All notable changes are grouped by build phase (see ARCHITECTURE.md §9).

## Phase 18 — AI Mentor

- Added `lib/ai/mentorContext.ts`'s `buildMentorContext()`: a genuinely
  compact context builder (brief §26: "Do NOT send the entire database
  blindly") — name/level/XP, current goal title, up to 5 recent quest
  titles and 3 recent failures, up to 3 recent achievement names. No
  descriptions, instructions, evidence, or other users' data.
- Added `POST /api/mentor`: runs entirely under the caller's own
  RLS-scoped session — `ai_messages` already has insert/select-own
  policies (Phase 2), so no admin/service-role client is needed here.
- Added `/mentor` (chat history + input) and `MentorChat`.
- Verified live: asked "What should I focus on next to reach my goal?"
  and got a real, structured, goal-aware answer (correctly referenced
  "your 5K goal in 60 days" with a genuine three-pillar training plan)
  — not templated boilerplate. Confirmed both turns persisted correctly
  in `ai_messages`.

## Phase 17 — Achievements

- Added `supabase/migrations/0005_seed_achievements.sql`: FIRST_QUEST,
  FIRST_WIN, STREAK_3, STREAK_7, LEVEL_5, LEVEL_10. The brief's
  FIRST_CLIENT/FIRST_REVENUE/FIRST_PRODUCT are intentionally not
  seeded — they need goal-category classification and client/revenue/
  product event detection from evidence, neither of which exists; dead
  config nobody could ever unlock isn't better than not seeding it.
- Wired deterministic granting into `/api/quests/[id]/evaluate`: a
  `grant(key)` helper calls the Phase 2-idempotent `unlockAchievement`
  unconditionally at each qualifying point (submission, pass, streak
  threshold, level threshold) — the DB's unique constraint is what
  makes "only once" actually true, not application logic guessing
  whether it's the first time.
- Added `/achievements`, DB-driven like `/skills`.
- The evaluate response now includes `newAchievements`; `QuestActions`
  dispatches staggered `ascend:achievement` events (5.5s apart) so a
  level-up and an achievement earned in the same evaluation queue
  instead of one celebration overlay instantly replacing the other.
- Verified live: submitted evidence for "Run/Walk Intervals" (evaluation
  correctly failed it — 1-minute intervals against a 2-minute
  requirement), and the response included `FIRST_QUEST` in
  `newAchievements`. Confirmed on `/achievements`: "First Quest" shows
  Unlocked with today's date, everything else correctly Locked.

## Phase 16 — Skill tree

- Added `supabase/migrations/0003_seed_skills.sql` (6 general skills:
  Execution, Consistency, Research, Communication, Focus, Creativity)
  and `0004_seed_skills_expand.sql` (Endurance, Strength, Flexibility,
  Learning, Financial Literacy — added after live testing showed the
  first batch was entirely soft-skill oriented and missed fitness/
  learning/money goal domains). Requirements are config data
  (`{"mastery_xp": 1000}` per skill), not hardcoded into the UI.
- Added `/skills`: renders every row from the `skills` table with
  locked/unlocked/mastery-N state from `user_skills`, driven entirely by
  the DB.
- Added `lib/quests/matchSkillId()`: loose case-insensitive match of the
  AI's free-text `skill` field against the skills catalog, wired into
  both quest-generation call sites (`/api/goals/plan`,
  `/api/quests/[id]/evaluate`'s next-quest step) — closes a real gap
  where `quests.skill_id` was always `null`, silently preventing the
  skill tree from ever populating.
- Verified live: re-triggered goal-plan generation after seeding
  Endurance and confirmed a new "Daily Brisk Walk" quest correctly
  matched `skill_id` to it. A sibling quest's AI-chosen skill name
  didn't fuzzy-match anything — expected best-effort behavior, not
  every AI wording will map to the (necessarily finite) catalog.

## Phase 15 — Level-up UX

- Added `lib/audio/sound.ts`: generative Web Audio API effects
  (`playFanfare`, `playChime`, `playClap`) and browser-native
  `speak()` via `SpeechSynthesisUtterance` — no licensed music/voice
  assets exist to source here, so this is real synthesized audio
  instead of a fake "plays music" claim. Every function takes an
  explicit `enabled` flag; nothing plays unless the caller passes `true`.
- Added `useSoundPreference()` (`lib/audio/`) reading/writing
  `app_settings.sound_enabled`, and `SoundToggle` on `/profile` — the
  single opt-in switch gating every sound/voice moment app-wide, off by
  default per the brief.
- Added `Confetti` (pure CSS/JS burst, no library) and
  `CelebrationOverlay` — shared by level-up (this phase) and
  achievements (Phase 17): confetti, fanfare/chime, spoken line,
  `navigator.vibrate` pattern, and an `aria-live="assertive"`
  announcement that fires regardless of the sound setting (that's
  accessibility, not "sound"). Confetti is skipped entirely under
  `prefers-reduced-motion`, not just slowed down.
- Added `GlobalCelebrationListener`, mounted once in `AppShell`,
  listening for `ascend:levelup`/`ascend:achievement` window events —
  keeps Phase 14's `QuestActions` decoupled from celebration UI/audio
  code; it just dispatches an event and moves on.
- Verified live: dispatching `ascend:levelup` renders the full overlay
  correctly (confetti particles, gradient "Level 3" headline, "New
  quests unlocked" subtitle, dismiss hint), no console errors.

## Phase 14 — AI evaluation (closes the core loop)

- Added `POST /api/quests/[id]/evaluate`: `submitted → under_review` →
  `evaluateQuest()` → `ai_evaluations` row → `completed`/`failed` →
  (if passed) `awardXP` → `updateSkillXP` → `updateStreak` →
  `unlockAchievement("FIRST_QUEST")` → best-effort next-quest generation
  for the same goal. On an `AIProviderError`, rolls the quest back to
  `submitted` (never strands it in `under_review`) and returns the
  Phase 24 "GAME MASTER TEMPORARILY UNAVAILABLE" copy.
- Server independently clamps `xp_awarded` to `[0, quest.xp_reward]` and
  `skill_xp_awarded` to `[0, 100]` — the AI's proposal is never trusted
  outright (brief §14/§22). Verified this matters: XP is only ever
  granted inside the `passed` branch, so a failed evaluation's proposed
  XP never reaches the profile even though it's recorded on the
  `ai_evaluations` row for audit purposes.
- Added `lib/progression/streaks.ts`: deterministic day-gap streak math
  (same day → no-op, +1 day → continues, bigger gap → resets to 1).
- Wired into `QuestActions`: submission immediately triggers evaluation
  (no separate background job) and shows the real pass/fail feedback via
  toast; a level-up dispatches an `ascend:levelup` window event for
  Phase 15's celebration UI to listen for.
- Verified live against a real quest: the AI correctly **failed** a
  submission that only described one mobility session against a 5-day
  success criterion (score 20, specific feedback identifying the gap) —
  proving both real evaluation intelligence and that the XP-clamping
  gate holds on the harder, more failure-prone path.

## Phase 13 — Evidence storage

- Added `supabase/migrations/0002_storage.sql`: private `quest-evidence`
  bucket (10 MB limit, `image/jpeg|png|webp` + `application/pdf`
  allowlist enforced by Storage itself, not just client-side), with
  `storage.objects` RLS scoping every read/insert to the uploading
  user's own path prefix (`${user_id}/${quest_attempt_id}/...`) — no
  update/delete policy, evidence is immutable once uploaded. Applied and
  verified live.
- Wired `CameraCapture` (Phase 10) into `QuestActions` for
  `evidence_type: "image"` quests: capture → upload to the bucket →
  `quest_evidence` row with `storage_path`/`mime_type`/`size_bytes` set.
  A caption is still required alongside the photo, since neither AI
  provider does vision input — the model needs something textual to
  evaluate regardless of what media was attached.
- Client-side size guard mirrors the bucket's 10 MB limit so a too-large
  photo fails fast with a clear message instead of a generic upload error.

## Phase 12 — Device permissions

- Added `/settings/device-access`: shows camera/microphone/motion/
  location/notifications state, with a per-row "Check" button that
  performs the real browser check (Permissions API where available,
  otherwise an actual request/getUserMedia probe) and upserts the result
  to `device_permissions` — never bypasses or spoofs what the browser
  actually reports.
- Linked from `/profile`.

## Phase 11 — Motion/Orientation

- Added `OrientationSensor` and `MotionSensor`
  (`components/sensors/`) — `DeviceOrientationEvent`/`DeviceMotionEvent`
  directly, never the Generic Sensor API. SSR-safe feature detection via
  `useSensorSupport` (same `useSyncExternalStore` fix as Phase 10's
  camera, applied proactively this time instead of hitting the bug again).
- iOS 13+'s `requestPermission()` is only called from a real click; every
  other browser has no such gate, so `enable()` just starts listening —
  matches the brief's "do not assume Generic Sensor API is available"
  and "request permission only after a button click".
- States rendered: Motion supported / Motion unavailable / Permission
  denied / (permission-required, before the click).
- Verified in-browser: both render their unsupported-vs-supported branch
  correctly with no hydration error, and clicking "Enable" on this
  no-requestPermission desktop browser correctly grants immediately and
  shows "Motion supported" (no live values, since there's no real sensor
  in this sandboxed environment — expected, same caveat as Phase 10).

## Phase 10 — Camera

- Added `CameraCapture` (`components/camera/CameraCapture.tsx`): feature
  detection via `useSyncExternalStore` (not a naive `typeof navigator`
  check — that caused a real hydration mismatch, since `navigator` is
  undefined during SSR; fixed by giving React explicit server/client
  snapshots), camera requested only after an explicit "Enable Camera"
  tap, front/back flip when `enumerateDevices` reports >1 camera,
  preview → capture → retake/confirm, and explicit error states for
  denied permission, no camera found, and generic failures.
- Every path that ends the stream (unmount, retake, cancel, confirm)
  calls `stopStream()` — the camera must never stay on after leaving.
- Verified in-browser: idle state renders (no hydration error after the
  fix — confirmed clean before/after), and triggering `getUserMedia` in
  this camera-less sandboxed environment correctly hits the
  `NotFoundError` branch end-to-end. Full permission-grant and live
  preview testing needs real device hardware — that's Phase 20's job.
- Not yet wired into quest evidence submission (Phase 9's `QuestActions`
  still text-only) — captured photos have nowhere durable to go until
  Supabase Storage exists (Phase 13). Wiring it in now would mean either
  storing raw image data in a text column or silently dropping it on
  refresh, neither of which is better than the current honest
  "text-for-now" state.

## Phase 9 — Quest experience

- Added `/quests` (list, grouped by status priority) and `/quests/[id]`
  (detail: description, objective, instructions, success criteria, and
  the lifecycle action for the quest's current status).
- Added `QuestActions`: drives the user-controllable part of the
  lifecycle (`available → accepted → in_progress → submitted`) directly
  against Supabase with the browser client — RLS's
  `USER_SETTABLE_QUEST_STATUSES` (Phase 5) is what actually enforces
  this is safe, the component just matches it. Starting a quest creates
  a `quest_attempts` row; submitting inserts `quest_evidence` and closes
  out the attempt. Anything past `submitted` (evaluation, completed/
  failed) is server-only — Phase 14, not here.
- Evidence capture is text-only for now, with an honest inline note
  ("photo/file/url evidence lands in Phase 10/13") rather than a capture
  UI that doesn't work yet.
- Dashboard's "Start Quest" CTA now deep-links to the specific quest.
- Verified live end-to-end: accepted → started → submitted a real
  AI-generated quest ("Walk-Jog Intervals"), confirmed in the DB that
  `quest_attempts.status = 'submitted'` and the evidence text landed
  correctly in `quest_evidence`.

## Phase 8 — Dashboard

- `/dashboard` now renders real data: greeting, avatar with level badge,
  XP progress bar (via the Phase 4 progression lib), streak, a "current
  quest" card (priority: in_progress > accepted > available, oldest
  first) with a gradient "Start Quest" CTA, the next milestone from the
  goal's AI plan, and a skills/achievements placeholder (Phase 16/17).
- Verified live: shows "Welcome back, QA", the real goal title, Level 2
  (20/150 XP), the AI-generated "Walk-Jog Intervals" quest with its
  actual difficulty/XP/time, and "Run 1km continuously" as the next
  milestone — all sourced from Phases 2-7's data, no placeholders left.

## Phase 7 — AI goal decomposition

- Added `POST /api/goals/plan`: loads the caller's own goal (RLS-scoped),
  calls `generateGoalPlan()`, persists `milestones`/`weekly_objectives`
  into `goals.ai_plan`, and inserts the *initial* quest set (never
  hundreds — brief §15) via the admin client, since `quests` has no
  user-insert policy by design. Server-clamps each proposed `xp_reward`
  to `MAX_INITIAL_QUEST_XP` (500) regardless of what the AI proposed —
  brief §14/§22's "AI must not be allowed to award unlimited XP" applies
  from the very first quests, not just evaluation.
- On an `AIProviderError`, returns the Phase 24 "GAME MASTER TEMPORARILY
  UNAVAILABLE" copy — never a raw error.
- Wired into `OnboardingForm`: right after the goal/profile rows are
  saved, it calls this route so a brand-new user already has real
  AI-generated quests by the time they land on the dashboard. Best-effort
  — a failure here shows a toast but never blocks onboarding completion.
- Verified live end-to-end: goal "run a 5K without stopping in 60 days"
  → 3 real, coherent quests ("Walk-Jog Intervals", "Lower-Body Strength",
  "Mobility Routine"), all `available`, correctly linked to the goal.
- Known gap: quest `skill_id` is left `null` (folded into the
  description instead) since the `skills` config table isn't seeded yet
  — revisit once Phase 16 seeds it.

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
