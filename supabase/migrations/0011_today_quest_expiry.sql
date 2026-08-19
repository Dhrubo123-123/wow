-- Roadmap item 3 — "Today" screen: one quest with a real expiry.
--
-- expires_at defaults to 24h from creation (created_at and now() are
-- the same instant at insert time, so `now() + interval '24 hours'`
-- as a column default lines up with "created_at + 24h" without a
-- trigger). Existing open quests are backfilled to expire 24h from
-- *now* on migration, not from their original created_at, so nobody's
-- quest silently expires the instant this ships.
alter table public.quests
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');

update public.quests
  set expires_at = now() + interval '24 hours'
  where status in ('available', 'accepted', 'in_progress');

-- 'expired' is a NEW terminal status, distinct from 'failed' — an
-- unclaimed/unfinished quest that ran out of time is never a penalty
-- (brief: never punish), just replaced with a fresh one. 'failed'
-- stays reserved for an AI evaluation that didn't meet the bar.
alter table public.quests drop constraint if exists quests_status_check;
alter table public.quests add constraint quests_status_check
  check (status in ('available', 'accepted', 'in_progress', 'submitted', 'under_review', 'completed', 'failed', 'expired'));

comment on column public.quests.expires_at is
  'Roadmap item 3 — when this quest stops being "today''s quest". Expiring never awards a penalty; lib/quests/today.ts replaces it with a fresh one.';
