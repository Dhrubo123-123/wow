-- ---------------------------------------------------------------------
-- Retention roadmap item 1 — earn-back now requires two genuine quest
-- completions within the window (not one), so it reads as "earned"
-- rather than a second free freeze.
-- ---------------------------------------------------------------------
alter table public.streaks
  add column if not exists earnback_redemptions integer not null default 0;

comment on column public.streaks.earnback_redemptions is
  'Completions logged so far toward redeeming an open earn-back window (needs 2 — see EARNBACK_REQUIRED_REDEMPTIONS in streakLogic.ts). Reset to 0 whenever last_streak_before_break is cleared (window closed, one way or another).';
