-- ---------------------------------------------------------------------
-- Streak forgiveness (post-launch retention pass) — a streak freeze
-- and an "earn it back" window, backed by research the user brought
-- back on Duolingo's streak-freeze retention data: streak users on
-- apps with freezes average ~48% longer streaks than those without.
-- No punishment mechanic added (XP/levels stay additive-only) — this
-- is purely "don't let one missed day be the end."
-- ---------------------------------------------------------------------

alter table public.streaks
  add column if not exists freezes_available integer not null default 1,
  add column if not exists last_streak_before_break integer,
  add column if not exists streak_break_expires_at date;

comment on column public.streaks.freezes_available is
  'Number of "streak freezes" the user can spend to bridge exactly one missed day without breaking their streak. Starts at 1 (free), replenished by lib/progression/streakLogic.ts on sustained streaks, capped there too — no column-level cap needed since the pure logic owns the rule.';
comment on column public.streaks.last_streak_before_break is
  'Set when a streak breaks with a "meaningful" length (>=2) — the value to restore to if the user completes a quest again within streak_break_expires_at (the "earn it back" window). Null once redeemed or expired.';
comment on column public.streaks.streak_break_expires_at is
  'Last date (inclusive) the earn-back window in last_streak_before_break is still valid.';
