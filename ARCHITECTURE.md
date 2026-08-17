# ASCEND Architecture

## 1. Product

ASCEND turns real-world goals into AI-generated quests. Core loop:

```text
GOAL → AI QUEST → ACTION → EVIDENCE → AI EVALUATION → XP → LEVEL UP → SKILL UNLOCK → NEXT QUEST
```

Non-negotiable: this is a web app / PWA. No native iOS/Android builds. First
production deployment must work through a mobile browser over HTTPS.

## 2. Stack

| Layer      | Choice                                                        |
| ---------- | --------------------------------------------------------------- |
| Language   | TypeScript everywhere                                          |
| Frontend   | React + Next.js (App Router), Tailwind CSS, accessible components |
| Backend    | Supabase (Postgres, Auth, Storage, Edge Functions/API routes)  |
| AI         | Cerebras API, model `gpt-oss-120b`, behind a provider abstraction |
| Hosting    | Cloudflare Pages/Workers (Vercel fallback if incompatible)     |

## 3. Repository layout (current)

```text
src/
  app/                 # routes (App Router)
    dashboard/ quests/ skills/ mentor/ profile/ onboarding/
    layout.tsx  page.tsx  error.tsx  global-error.tsx
    loading.tsx not-found.tsx  manifest.ts  globals.css
  components/
    ui/                # Button, Card, Modal, ProgressBar, Badge,
                        # Avatar, Toast, BottomNavigation
    AppShell.tsx        # mobile-first shell + bottom nav gating
    ErrorBoundary.tsx   # subtree-level React error boundary
    icons.tsx           # dependency-free inline icon set
    PhasePlaceholder.tsx
  lib/
    utils/cn.ts         # Tailwind class merge helper
    progression/         # (Phase 4) XP engine — planned
    ai/                  # (Phase 6) AI provider abstraction — planned
```

Future phases add `lib/ai/`, `lib/progression/`, `lib/supabase/`,
`lib/culinary/` (see §7), plus `supabase/migrations/`.

## 4. Design tokens

Defined in `src/app/globals.css` via Tailwind v4 `@theme inline`. Dark-first
RPG palette: `background`/`surface`/`surface-raised` neutrals, `primary`
(violet) for interactive elements, `accent` (gold) for XP/reward emphasis,
plus `success`/`danger`/`warning`/`info` status colors. `prefers-reduced-motion`
is respected globally (relevant to Phase 15 level-up animations).

## 5. AI provider abstraction (Phase 6, planned)

```text
AIProvider (interface)
   ├── CerebrasProvider   — calls gpt-oss-120b, server-side only
   └── MockAIProvider     — deterministic fixtures for tests/dev
```

`CEREBRAS_API_KEY` is server-only. All AI calls route through Next.js API
routes / Supabase Edge Functions; the client never talks to Cerebras
directly. All AI JSON output is validated with Zod before being trusted or
persisted; invalid output triggers one corrected retry, then a controlled
error — it is never stored.

## 6. XP / progression engine (Phase 4, planned)

Deterministic, non-AI logic in `lib/progression/`. Every XP change is
recorded as an immutable `xp_transactions` row — user XP is never
overwritten in place. The AI evaluator proposes `xp_awarded`; the server
independently clamps it against a configured maximum (Phase 14/21).

## 7. Product amendment — single-smartphone culinary training mode

*(Recorded 2026-08-17, supersedes any earlier multi-camera/multi-sensor
assumption. Affects Phases 5, 6, 10, 11, 16 — not yet implemented.)*

**Core principle:** one user + one smartphone + one camera = a complete
culinary training experience. No external cameras, smart scales,
temperature probes, or dedicated headsets required for MVP.

**Phone positions (all optional, Counter Mode is default):**

- **Counter Mode (default):** phone on a stand facing the workspace.
- **Chest/body mount:** optional, more first-person view.
- **Smart Glass Mode:** future/premium only (e.g. Meta Ray-Ban style),
  never a hard dependency.

**Event pipeline — do not stream raw frames to the LLM:**

```text
Camera → lightweight/local CV layer → compact events → Cerebras (reasoning only)
```

Example events: `ONION_DETECTED`, `CHOPPING_STARTED`,
`APPROX_CUT_RATE: 41/MIN`, `PIECE_CONSISTENCY: 82%`, `STIRRING_DETECTED`,
`INGREDIENT_ADDED`, `TIME_REMAINING: 08:20`. `gpt-oss-120b` consumes these
compact events for coaching, adaptive quest generation, and evaluation — it
never receives a raw video stream. Metrics are training estimates, not
lab-grade measurements; the product must never claim precision the camera
can't deliver.

**Configurable skill framework (culinary):** Technique, Speed, Precision,
Consistency, Timing, Organisation, Adaptability, Safety awareness,
Presentation — scored 0–100, evolving through completed quests, sourced
from config/DB (per Phase 16's "don't hardcode the skill tree" rule).

**Adaptability engine:** the AI deliberately introduces controlled
constraint changes (missing ingredient, reduced time, forced retry) and
scores problem recognition, decision speed, substitution quality, execution
quality, and performance under time pressure into an Adaptability score.

**Hardware policy:** required = one smartphone. Optional = stand, chest
mount, compatible smart glasses. Future hardware integrations must be
modular and never a core MVP dependency.

**Build order for this mode:** camera → camera evidence → basic CV →
culinary event detection → AI culinary coach → adaptive quests → skill
scoring → voice interaction → motion/gyroscope mechanics → optional
smart-glasses integration.

**Positioning:** ASCEND is "AI-powered adaptive culinary training" — it
observes performance, measures available signals, and adapts difficulty.
It does not claim to turn anyone into a professional chef.

## 8. Security posture

- `CEREBRAS_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: server-only, never in
  client bundles, git, or docs.
- Every user-owned Supabase table gets RLS policies (Phase 2).
- AI output is schema-validated before storage; never trusted blindly.
- Evidence uploads are validated by MIME type, extension, and size, and
  served via signed URLs (Phase 13).

## 9. Phase status

See [CHANGELOG.md](./CHANGELOG.md) for the authoritative, dated log.
Phase order follows the master build brief (Phase 0 → Phase 26); phases are
not skipped, and each must pass tests/lint/typecheck/build before the next
begins.
