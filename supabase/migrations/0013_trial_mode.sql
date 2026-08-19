-- ---------------------------------------------------------------------
-- Retention roadmap item T — trial mode. `plan` and `trial_ends_at`
-- default at the row level (not in application code) so every new
-- signup — including anonymous auth from roadmap item 2's onboarding —
-- gets a trial window with zero extra code paths to keep in sync.
--
-- Deliberately entitlement-*tracking*, not entitlement-*enforcement*:
-- this does not gate any quest/AI/evaluation functionality. The brief
-- calls for ~10 full-access trial users right now (see roadmap item
-- A's budget sizing) — nothing here should silently start blocking
-- them. It only makes "how much trial is left" a real, queryable fact
-- so the settings banner has something honest to show.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists plan text not null default 'trial'
    check (plan in ('trial', 'full')),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days');

comment on column public.profiles.plan is
  'Roadmap item T. "trial" or "full" — tracking only, not yet enforced anywhere.';
comment on column public.profiles.trial_ends_at is
  'Roadmap item T. 14 days from signup by default. Drives the settings trial banner; does not itself restrict access.';

-- ADD COLUMN with a non-constant default (now() + interval) evaluates
-- once at migration time and backfills every existing row with that
-- same value — existing users get a trial window starting now rather
-- than backdated to their original signup, so nobody's trial appears
-- to have already silently expired.
