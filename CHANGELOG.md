# Changelog

All notable changes are grouped by build phase (see ARCHITECTURE.md §9).

## Post-launch — Roadmap item 1: freeze/earn-back fixes

- **Freeze coverage is now predicted, not discovered retroactively.**
  New `describeStreakRisk` (pure, tested) reads today's date against
  the stored streak state and returns one of `safe` /
  `freeze-will-cover` / `at-risk` / `earnback-in-progress` — shown
  directly on the dashboard's Today card. Previously a freeze auto-
  consuming only ever showed up as a toast the next time a quest was
  completed, which could be days later; now it's visible the same day
  it matters, before the user does anything.
- **At-risk messaging reads freeze state first, by construction** — the
  function checks `freezesAvailable` before ever returning `at-risk`,
  so a covered day can never produce a panic message. (No push/email
  reminder system exists yet — that's roadmap item 6 — but this
  function is what item 6 will call, so the "read freeze state first"
  rule is already enforced at the source, not per-channel.)
- **Earn-back now requires two genuine quest completions**, not one —
  `earnback_redemptions` tracks progress (new `streaks` column);
  `earnback_succeeded` only logs once both are done. Deliberately
  *not* a special AI-generated "bonus quest" — any second real
  completion counts, which stays deterministic, costs no extra AI
  call, and avoids adding AI-budget load right before roadmap item A
  (which exists specifically to protect that budget). Flagging this as
  a scope decision, not an oversight — happy to revisit once item A's
  quest-caching lands, since a cached "bonus quest" would then be free.
- 7 new test cases (32 → 39): freeze-covers-today message wording, at-
  risk-with-no-freeze, earn-back requiring exactly 2 redemptions
  (partial redemption keeps the window open, same-day double-
  completion redeems it), earn-back-in-progress messaging, and the
  existing expiry/replenishment cases carried forward unchanged.
- `npm run lint`, `npm run build`, `npm test` (39/39) all pass.

## Post-launch — Roadmap item 0b: richer evaluation_returned event

- `evaluation_returned` now also logs the server-clamped `xpAwarded`
  (never the AI's raw proposal — same clamp already enforced on the
  actual XP award) and a nullable `tier` field, reserved for item 5's
  Bronze/Silver/Gold grading — `null` until that ships, not a
  fabricated value.
- Added an explicit TODO + doc comment on `/admin/metrics`: the
  `ADMIN_EMAILS` env-var allowlist is a stopgap for "one founder, one
  collaborator" and must become a real `is_admin` column/table with
  RLS before granting access more broadly — an env var isn't an access
  control system.
- `npm run lint`, `npm run build` (regenerates Next's route types +
  typechecks), `npm test` (32/32) all pass.

## Post-launch — Retention roadmap §0: instrumentation

First of the 8-item retention roadmap, done in the requested order:
one item, verified, one commit, then a pause for a decision before the
next. This item is the measurement instrument every later item gets
judged against.

- New `events` table (append-only, RLS insert/select-own) + the full
  event vocabulary in `lib/events/names.ts`: onboarding_started/
  completed, first_quest_accepted, evidence_submitted,
  evaluation_returned, streak_extended, freeze_consumed,
  earnback_started/succeeded/expired (party/kudos names reserved for
  §7, not wired up yet).
- Two Postgres RPCs (`admin_retention_cohorts`, `admin_streak_distribution`)
  do the actual cohort math in SQL rather than the app — `security
  definer` so they can read `auth.users`, called only from the
  service-role admin client, never exposed to `anon`/`authenticated`.
- `lib/events/log.ts` (server, best-effort, never breaks the action
  it's attached to) and `lib/events/track.ts` (client, fire-and-forget
  `fetch` with `keepalive`) — plus `POST /api/events` for client-
  triggered events, running under the caller's own RLS session.
- `earnback_expired` has no natural trigger moment (streak updates
  only run on quest completion, so a window nobody redeems just sits
  there) — handled with a lazy check on dashboard load
  (`expireEarnbackIfPast`) instead of standing up a cron job for one
  metric.
- New `/admin/metrics` page: D1/D7/D30 retention by signup cohort +
  streak-length distribution. Gated by an `ADMIN_EMAILS` allowlist
  (plain env var, not a role column/table — right-sized for one or two
  people needing this, not a permissions system). Not linked from
  anywhere in the app.
- Verified live end-to-end, not just compiled: posted a real event
  through the running dev server with a real session, confirmed it
  landed in the database, and called both RPCs directly — cohort/
  distribution numbers came back correctly (small/zero right now since
  the events table only starts collecting from this deploy forward,
  exactly as expected).
- `npm run lint`, `tsc --noEmit`, `npm run build`, `npm test` (32/32,
  unchanged — this item added no pure-logic to unit test, it's
  plumbing) all pass.

## Post-launch — Retention roadmap + streak freeze/earn-back (research-backed)

User brought back sourced research (Duolingo's own blog/PM interviews,
a peer-reviewed Strava kudos study, Trophy's gamification benchmark
data, Habitica post-mortems, Adjust/AppsFlyer/Statista retention
benchmarks) on what actually drives day-2/day-7 retention in habit
apps. Full prioritized roadmap below; shipped the top item now.

**Roadmap, ranked by cited effect size:**
1. **Streak freeze + earn-back** (shipped this pass) — apps with streak
   freezes average ~48% longer streaks (Trophy data); Duolingo's
   earn-back mechanic increased retention among users who'd break a
   streak. Cheap to build, ties for #1 impact.
2. **Social layer** (not yet built — real schema work) — Duolingo:
   users with ≥1 shared streak are 22% more likely to complete their
   daily lesson; Strava: a 329-runner longitudinal study found kudos
   recipients run more and more often. Habitica's post-mortems warn the
   party system's accountability evaporates once a party goes quiet —
   so any implementation should keep parties tiny (2-3) and let the AI
   Game Master re-pair abandoned parties rather than leaving them dead.
3. **Day-one guaranteed win** (not yet built) — Trophy: users who
   unlock an achievement on day one retain at 33.4% vs 20.4% who
   don't. Needs an onboarding change: guarantee a completable quest in
   the first session, before asking for anything else.
4. **Variable rewards as "week-one sizzle"** (not yet built) — the
   psychology is real (variable-ratio schedules resist extinction best)
   but the research is clear this alone doesn't sustain long-term habit
   formation — stable, same-time-same-place cues do. Recommendation:
   add a small randomized bonus-XP roll (still server-clamped, per the
   brief's "never unlimited XP" rule) as flavor, not the core loop.
5. **Copy tuning** (not yet built, cheapest possible win) — Duolingo
   changed one CTA ("continue" → "commit to my goal") and saw a
   measurable DAU lift from that alone.
6. **Friday-easy-quest** (not yet built) — Trophy data: Friday accounts
   for >25% of all streak losses industry-wide; a deliberately low-
   effort Friday quest is a plausible direct mitigation.

**What shipped now — streak freeze + earn-back:**
- New `streaks` columns: `freezes_available` (starts at 1, replenishes
  +1 every 7-day streak milestone, capped at 2), `last_streak_before_break`
  + `streak_break_expires_at` (a 2-day grace window to restore a broken
  streak of 2+ days rather than resetting to 1 forever).
- `lib/progression/streakLogic.ts` rewritten as a pure, fully-tested
  state machine (8 new test cases: freeze-bridges-one-missed-day,
  freeze-unavailable-resets, earn-back-restores-within-window,
  earn-back-expires, freeze-replenishment-and-cap). Still strictly
  additive — no XP/level penalty ever, matching both the brief's
  original design and the research finding that punishment mechanics
  (Habitica's HP loss, cited by name) correlate with worse long-term
  retention.
- `QuestActions` now explicitly toasts "❄️ Streak freeze used" and
  "🔥 Streak restored!" — a silent number change here would read as a
  bug, not a feature.
- Dashboard/profile streak badges show the freeze count (❄️ N) so the
  mechanic is visible, not hidden state.
- Migration applied directly to the live Supabase project via the
  Management API's SQL endpoint (no CLI migration tooling in this
  project — same pattern as every prior migration).
- `npm run lint`, `tsc --noEmit`, `npm run build`, and `npm test`
  (32/32, up from 24 — 8 new streak-logic cases) all pass.

## Post-launch — Interactive voice mentor + display typography + a real perf fix

Two separate asks landed together: the AI Mentor needed to actually
listen, not just speak; and the UI still read as "basic fonts" with
reported lag despite the previous motion pass.

- **Voice input, not just voice output**: new
  `lib/audio/useSpeechRecognition.ts` wraps the Web Speech API
  (feature-detected — Chrome/Edge/Safari support it, Firefox doesn't,
  same "never assume a browser API exists" rule as camera/motion).
  `MentorChat` now has a mic button: tap it, ask out loud, the
  transcribed question sends automatically, and — when sound is
  enabled — the mentor's reply is spoken back automatically too. That
  closes the loop into an actual two-way conversation instead of typed
  text with narration bolted on afterward. Text input still works
  exactly as before for anyone without mic support.
- **Real performance bug found and fixed**: the primary-button glow
  from the previous pass animated `box-shadow` directly, which forces
  a full repaint every frame — not compositor-only. Running that
  alongside the ember particles, shimmer sweep, and card animations was
  a plausible real cause of reported lag, not just a vibe complaint.
  Rewrote it to animate a separate layer's `opacity`/`transform`
  instead — same visual pulse, entirely GPU-compositable.
- **Display typography**: added Cinzel (an engraved, seal-like serif
  that matches the emblem's "old coin" styling) as a heading-only font
  via `next/font/google`, applied globally to `h1`–`h4` plus the Logo
  wordmark. Body copy stays on Geist Sans for small-size readability —
  this is a heading accent, not a full font swap, so it doesn't fight
  legibility anywhere text-dense (chat bubbles, quest instructions).
  This is the direct fix for "basic fonts."
- **Narration pacing**: `speak()`'s rate dropped from 0.98 to 0.88 —
  slower reads as a patient guide, not a rushed notification.
- Honest scope note (told to the user directly, repeating here for the
  record): true cinematic production — hand-animated sequences,
  professional voice acting, a score — is out of reach for hand-written
  CSS/SVG in a codebase like this. What shipped here is the real,
  achievable version: distinctive typography, GPU-friendly motion, and
  an actually-interactive voice loop.
- `npm run lint`, `tsc --noEmit`, `npm run build`, and `npm test`
  (24/24) all pass. Verified live: mic button renders and is
  feature-detected correctly in a Chromium-based browser, no console
  errors, Cinzel renders in both the wordmark and page headings.

## Post-launch — "It still looks ordinary": ambient motion pass

User feedback after the rebrand, backed by real screenshots of the live
app: the new logo was premium but every page below it was still flat,
static, and dead — big empty black spaces, no motion, nothing "alive."

- **Root cause found, not just papered over**: `AppShell`'s wrapper
  `div` had an opaque `bg-background` class that was painting over the
  ambient radial-gradient glow already defined on `<body>` — that glow
  only ever showed on the landing page (which skips AppShell). Every
  logged-in page was covering its own background decoration. Fixed by
  making the AppShell wrapper transparent (`relative z-10`, no solid
  fill) so body's glow shows through everywhere.
- **New `EmberField`** (`components/branding/EmberField.tsx`): small
  glowing gold particles drifting up from the bottom of the screen,
  forever — the app's signature ambient layer, mounted once in the root
  layout so it's behind every page. Positions are deterministic
  (index-based integer math, not `Math.random()`) for the same reason
  the logo emblem needed float-rounding earlier — this is SSR'd, and
  anything non-deterministic here would hydration-mismatch.
- **Card entrance animation**: `.stagger-children` (globals.css) fades
  + rises each direct child in on mount, one after another, instead of
  everything popping in flat and simultaneous. Applied to every main
  page's content container (dashboard, quests, quest detail, skills,
  achievements, profile).
- **XP bars actually glow now**: `ProgressBar`'s fill switched from a
  flat `bg-accent` to the gold gradient with a looping shimmer sweep
  across the filled portion.
- **Buttons breathe**: the primary CTA's static glow became a slow
  looping pulse (`animate-glow-pulse`), and every button now has a
  subtle press-scale (`active:scale-[0.97]`) so taps feel acknowledged.
- **Streak flame flickers**: the 🔥 in the streak badge (dashboard,
  profile) now has a small continuous scale/rotate flicker instead of
  sitting static.
- All of the above sits inside the existing global
  `prefers-reduced-motion` rule (already in globals.css from Phase 15),
  so it's automatically disabled for anyone who's asked for less motion
  — nothing new to wire up there.
- Verified live: caught and correctly diagnosed a false alarm mid-way
  through — a screenshot taken ~1s after navigation showed "empty"
  pages, which looked like a bug but was actually just catching the new
  fade-in animation before it finished; a direct DOM/computed-style
  query confirmed every element was present, positioned, and at
  opacity 1, and a screenshot taken a beat later showed everything
  fully rendered. `npm run lint`, `tsc --noEmit`, `npm run build`, and
  `npm test` (24/24) all pass.

## Post-launch — Rebrand: ASCEND → EMBER, golden emblem + wordmark

User feedback: the plain gradient-text "ASCEND" logo didn't feel like a
real, premium brand — wanted something with the craft of an epic-legend
seal, gold, "wow." Also asked for a "real name" — considered several
directions (Agni, Veer, Tejas — all common Sanskrit-brand words already
used everywhere in India) before landing on **EMBER**: a plain English
word (zero pronunciation barrier — matches the "all can use it" goal),
and a genuinely apt metaphor for the app's actual mechanic — a small
ember is unrealized potential; every completed quest is fuel that grows
it into a real flame. The ascending-flame logo mark makes that literal.

- **New brand mark** (`components/branding/Logo.tsx`): a fully vector
  (SVG) golden emblem — an ascending flame over a sunburst, ringed like
  an engraved coin/seal with tick marks and a bow-like base flourish —
  plus a matching gold-gradient wordmark. No external font or image
  asset; scales crisply at any size from one component.
- **Real bug caught during this pass**: the emblem's tick marks and
  sunburst rays are positioned with `Math.cos`/`Math.sin`, which can
  differ in their last floating-point digit between Node's SSR pass and
  the browser's V8 — React correctly flagged this as a hydration
  mismatch on the login/signup pages where the mark is server-rendered.
  Fixed by rounding every computed coordinate to 3 decimal places
  before render, which converges both sides to an identical string.
- **New icons**: regenerated `icon-192`, `icon-512`, `icon-maskable-512`,
  and `apple-touch-icon` to match the new emblem via a Pillow script
  (`scripts/generate-icons.py`, checked in for future re-runs) — same
  composition as the SVG, including a correctly-sized safe zone for the
  maskable icon (the first icon pass had the ring nearly touching the
  edge, which Android's circular mask would have clipped).
  `manifest.ts`'s `name`/`short_name`, `layout.tsx`'s metadata, and
  every in-app string that said "ASCEND" (onboarding, offline page,
  device-access settings, install banner, all five AI system prompts)
  now say "EMBER".
- Login and signup pages now show the emblem above the heading, with
  copy nudged to match ("Light Your Ember", "keep your fire burning").
- The repo, git remote, Vercel project slug, and production URL
  (`ascend-ten-opal.vercel.app`) intentionally still say "ascend" —
  renaming infrastructure/domains is a separate, higher-risk step from
  renaming the brand users actually see, and nothing required it here.
- Verified in a fresh browser tab (not just a HMR'd one — dev's
  service worker was serving a stale cached bundle that made the fix
  look like it hadn't landed; a hard reload + SW unregister confirmed
  it had). `npm run lint`, `tsc --noEmit`, `npm run build`, and
  `npm test` (24/24) all pass.

## Post-launch — Live AI Coach ("AI has eyes")

A real live-vision coaching feature — not evidence capture. While a
quest is in progress, an opt-in camera loop periodically sends a frame
to a vision-capable AI model along with the quest's context, and the
model speaks a short real-time correction or encouragement (technique,
form, an ingredient that looks off) — the way a coach standing next to
someone would, e.g. "you're chopping from the middle — that vegetable
looks bruised, use the fresh part and start from the side."

- **New AI capability**: `lib/ai/coach.ts` calls Groq's `qwen/qwen3.6-27b`
  directly (the only vision-capable model across either configured
  provider — confirmed via docs and live testing; Cerebras's
  `gpt-oss-120b` has no image input at all). Kept deliberately outside
  the swappable `AIProvider` abstraction since vision is a genuinely
  different model capability, not a drop-in replacement for the
  text-only providers.
- **Real constraint, not a guess**: direct testing against the live API
  found (a) the model is a reasoning model by default and silently
  returns empty content under a modest `max_tokens` unless
  `reasoning_effort: "none"` is set, and (b) this Groq account's vision
  model is capped at ~8000 tokens/minute, with each frame costing a
  fixed ~1850 tokens regardless of resolution (image tiling, not
  bytes-based). That puts the sustainable ceiling at ~4 requests/minute
  — `LiveCoach.tsx` polls every 15s (not an arbitrary "feels real-time"
  number) and the coach API route rate-limits at 8/min per user to
  match.
- **New route**: `POST /api/quests/[id]/coach` — authenticated,
  rate-limited, verifies the quest is the caller's own and `in_progress`
  before spending a vision call on it. Stateless by design: the frame
  is analyzed in memory and discarded the instant the request returns —
  never written to Storage, the DB, or logs, matching the same "camera
  must never persist" rule as evidence capture. Never touches XP or
  quest status — purely advisory, so the "AI must not award unlimited
  XP" constraint doesn't even apply here.
- **New component**: `LiveCoach.tsx` — explicit opt-in ("Start Live AI
  Coach"), live preview (reuses the same post-mount stream-attachment
  fix as `CameraCapture`), a visible remaining-time indicator, a
  color-coded good/warning/danger banner, spoken feedback through the
  existing bilingual voice engine, haptic buzz on warning/danger, a
  hard 6-minute session cap, and a Stop button. Camera stops immediately
  on stop/unmount — never left running silently.
- Verified end-to-end against the live dev server and the real Groq API
  (not mocked): authenticated request → ownership/status check → vision
  call → schema-validated JSON response, in both English and Hindi.
  `npm run lint`, `tsc --noEmit`, `npm run build` (20 routes now), and
  `npm test` (24/24) all pass.

## Post-launch — Engagement pass (voice, ambient music, camera fix, bigger celebrations)

Follow-up pass after production deployment, in response to feedback that
the camera preview showed nothing and the experience needed real
guided-voice + music engagement rather than silent SFX-only celebrations.

- **Fixed a real bug**: the camera `<video>` element only rendered once
  `CameraCapture` reached the `"streaming"` state, but the code was
  attaching `stream` to `videoRef.current` *before* that state flip —
  so `videoRef.current` was still `null` and the assignment silently
  did nothing. The live preview never appeared. Fixed by moving the
  attachment into a `useEffect` keyed on `state`, which runs after the
  video element has actually mounted. Also added a framing guide
  overlay, a shutter flash + click sound + haptic tick on capture, and
  a fixed `aspect-[3/4]` container so the preview can't collapse to
  zero height before metadata loads.
- **Bilingual guided voice** (English/Hindi): `lib/audio/sound.ts`'s
  `speak()` now picks a matching system voice by language (`lib.audio`
  voice selection prefers a local/on-device voice, falls back
  gracefully if the requested language isn't installed). New
  `lib/audio/narration.ts` holds the bilingual line library and fires
  spoken cues at dashboard welcome, quest accepted/started, the evidence
  capture step, and quest submission — not just the existing level-up/
  achievement moments.
- **Generative magical ambient music** (`lib/audio/ambient.ts`): a
  synthesized pad (detuned oscillators through a slowly breathing
  lowpass filter) plus a random pentatonic arpeggio, run through a
  small feedback-delay reverb — no licensed track, everything is
  Web Audio synthesis. Independent opt-in toggle from SFX; a new
  `AmbientMusicController` (mounted in `AppShell`) starts/stops it
  based on the saved preference and pauses it on tab visibility change.
- **Bigger celebrations**: level-up now triggers a `Confetti
  variant="fireworks"` burst (multiple radial launch points) instead of
  a plain falling shower, plus a layered fanfare+clap and a pulsing
  "magic glow" behind the celebration card. Achievement unlocks got a
  chime+clap layer too.
- **Preferences**: extended `useSoundPreference` to also manage
  ambient-music-enabled and voice-language, stored in the `app_settings
  .settings` jsonb column that was already provisioned for exactly this
  — no migration needed. `SoundToggle` (rendered on `/profile`) is now
  a full "Sound & Voice" panel with all three controls.
- Verified against the live dev server: Sound & Voice panel renders and
  toggles correctly, no console errors; the camera flow correctly
  reaches its "no camera found" error state in the sandboxed browser
  (no physical webcam available there) without crashing, confirming
  the state machine and the fixed attachment effect both run cleanly.
  `npm run lint`, `tsc --noEmit`, `npm run build` (all 19 routes), and
  `npm test` (24/24) all pass.

## Phase 22-25 — Performance, testing, error handling, observability

**Phase 22 (performance)** was mostly a discipline check, not new code:
route-level code splitting via the App Router, `next/image` for
avatars, zero animation libraries (CSS-only), and parallel `Promise.all`
queries everywhere multiple independent reads happen (dashboard,
profile, mentor context). No unnecessary dependencies were ever added —
confirmed by reviewing `package.json`: Supabase, Zod, clsx/tailwind-
merge, `server-only`, and (this phase) Vitest for testing.

**Phase 23 (testing):** added Vitest. 24 unit tests across the
deterministic, non-AI logic the brief calls out by name:
- `lib/progression/levels.test.ts` — XP/level math (growth curve,
  threshold boundaries, negative-XP clamping)
- `lib/quests/transitions.test.ts` — every legal quest/attempt lifecycle
  step allowed, every skip/reversal/terminal-state-exit rejected
- `lib/progression/streakLogic.test.ts` — day-gap streak rules

Split `nextStreakState` out of `streaks.ts` into a new `streakLogic.ts`
specifically so it could be unit-tested directly (`streaks.ts` is
`server-only` and touches the DB — neither plays well with a plain
Vitest run). Integration/E2E tests intentionally aren't a mocked suite
here — this project's actual verification method throughout has been
live-testing each phase against the real deployed Supabase/Groq stack
(see every phase's CHANGELOG entry above), which tests the real RLS and
schema behavior a mock never would.

**Phase 24 (error handling)** was already built in as each phase
landed, not bolted on after: every AI failure returns the brief's exact
"GAME MASTER TEMPORARILY UNAVAILABLE" copy, every DB failure returns
"Something went wrong / your progress is safe", and no route ever
surfaces a raw error/stack trace — confirmed during Phase 21's live
testing (`{"error": "..."}` JSON on every failure path, never HTML/stack).

**Phase 25 (observability):** added `lib/observability/logger.ts` —
structured `console.error` (Vercel/Cloudflare both capture stdout as
queryable logs without needing a separate service for an MVP) with a
required `scope` and defensive redaction of known-sensitive keys
(API keys, passwords, tokens, evidence/free-text content). Wired into
every failure path across the three AI-backed routes: AI provider
errors, and DB insert/update failures on `ai_evaluations`, `goals`,
`quests`, and `ai_messages`.

## Phase 21 — Security audit

- Secret scan: `git grep` for API key/token/service-role patterns across
  all tracked files — clean. Confirmed `.env.local` stays untracked
  (only `.env.example`, all-empty placeholders, is committed).
- **Found and fixed a real bug**: every unauthenticated `/api/*` request
  was getting a `307` HTML redirect to `/login` instead of a clean
  `401` JSON — `proxy.ts`'s blanket auth redirect didn't distinguish
  API routes from pages. A `fetch()` caller following that redirect
  would try to parse the login page's HTML as JSON and fail silently
  into a generic error. Fixed: API routes now bypass the redirect
  entirely and rely on each handler's own `if (!user) return 401`
  (every route already had one). Verified live: all three AI-backed
  routes now return real `401`s unauthenticated, and `400`s on
  malformed input (bad UUID, invalid JSON body).
- Added `lib/rateLimit.ts`: in-memory sliding-window limiter, applied to
  `/api/mentor` (10/min), `/api/goals/plan` (5/min), and
  `/api/quests/[id]/evaluate` (10/min) — the three routes that call a
  metered AI API and/or award real XP. Documented its known limitation
  (per-process, not shared across serverless instances) rather than
  overstating what it guarantees.
- Upload validation (MIME/size) already enforced at the Storage layer
  itself (Phase 13's bucket config), not just client-side — re-confirmed
  rather than re-tested.
- RLS cross-user isolation was exercised implicitly throughout every
  phase's live verification (every query is scoped through the caller's
  own session) rather than re-tested in a dedicated pass here.

## Phase 20 — Mobile QA

- Swept all five required widths (360/375/390/412/430) across dashboard,
  quests, skills, achievements, mentor, profile, and device-access
  settings: `scrollWidth === clientWidth` everywhere (no horizontal
  scroll), confirmed visually at both extremes (360 and 430).
- Found and fixed a real staleness bug while sweeping: the dashboard's
  "Skills & achievements" card still said "lands in Phase 16/17" even
  though both were built two phases ago — now links to `/skills` and
  `/achievements` like the profile page already did.
- `Modal` (Phase 1) remains unused by any feature — celebrations use the
  purpose-built `CelebrationOverlay` instead — so there's no live dialog
  to visually QA; its bottom-sheet-on-mobile layout
  (`max-h-[85vh] overflow-y-auto`) was already built dialog-safe.
- Forms (onboarding, evidence submission, mentor chat) were already
  exercised live in earlier phases at mobile viewport sizes.

## Phase 19 — PWA

- Generated real PWA icons with Pillow (no SVG rasterizer available in
  this environment — see ARCHITECTURE.md §11): `icon-192.png`,
  `icon-512.png`, a maskable variant, and a 180×180 apple-touch-icon.
  Gradient background matches the app's `--gradient-primary` token.
- `manifest.ts` now references the real icons (`any` + `maskable`
  purposes) and adds `scope`/`orientation`; root layout's metadata
  references the same icon set for browser tabs and iOS home-screen.
- Added `public/sw.js`: a hand-written service worker (no Workbox/
  next-pwa dependency) — network-first for navigations with an offline
  fallback shell (`/offline`), cache-first only for content-hashed
  static assets. Deliberately not offline-first: quests/AI evaluation
  need the network regardless, so caching dynamic pages would just
  serve stale data.
- Added `PWAProvider`: registers the service worker and shows a custom
  "Install ASCEND" banner via `beforeinstallprompt` where supported
  (Chrome/Android/desktop — iOS Safari never fires this event; there,
  Add to Home Screen is manual via the share sheet, which no web API
  can trigger). Dismissal is remembered per-device.
- Verified live: manifest resolves with the real icon URLs, an icon
  actually renders as a 512×512 image in-browser, and the service
  worker registers and activates (`getRegistrations()` confirmed).

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
