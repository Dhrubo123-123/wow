# ASCEND

**AI-Powered Real-Life RPG.** Turn Your Real Life Into Quests.

```text
GOAL → AI QUEST → ACTION → EVIDENCE → AI EVALUATION → XP → LEVEL UP → SKILL UNLOCK → NEXT QUEST
```

ASCEND is a mobile-first Progressive Web App — **not** a native iOS/Android app.
It must work through a mobile browser first, and be installable as a PWA where
supported.

## Stack

- **Frontend:** TypeScript, Next.js (App Router), React, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Storage, RLS)
- **AI:** Cerebras API (`gpt-oss-120b`), behind a swappable provider abstraction (`lib/ai/`)
- **Hosting:** Cloudflare Pages/Workers (Vercel as fallback)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and the phased build plan.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values, never commit this file
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Purpose                        |
| --------------- | ------------------------------- |
| `npm run dev`   | Start the dev server            |
| `npm run build` | Production build                |
| `npm run start` | Serve the production build      |
| `npm run lint`  | ESLint                          |

## Environment variables

See [`.env.example`](./.env.example). `CEREBRAS_API_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are **server-only** — never referenced from
client components, never prefixed with `NEXT_PUBLIC_`, never committed.

## Requirements

Node 20 works today, but `@supabase/supabase-js` now targets Node 22+ and
prints an `engines` warning on install/build. Not yet a hard blocker — plan
to upgrade the dev/deploy Node version before it becomes one.

## Project status

Phase 0-2 complete (foundation, mobile shell, Supabase auth/schema/RLS).
See [CHANGELOG.md](./CHANGELOG.md) for phase-by-phase progress and
[ARCHITECTURE.md](./ARCHITECTURE.md) for what's built vs. planned.
