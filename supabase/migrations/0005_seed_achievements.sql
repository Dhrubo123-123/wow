-- ASCEND achievement catalog seed (Phase 17)
-- Granting rules live in code (server-side only, via unlockAchievement's
-- idempotent insert against the unique(user_id, achievement_id)
-- constraint from Phase 2) — this table is just the config data.
--
-- FIRST_CLIENT / FIRST_REVENUE / FIRST_PRODUCT from the brief's example
-- list are intentionally NOT seeded here: they require classifying a
-- goal as "freelancing/business" and detecting client/revenue/product
-- events from quest evidence, neither of which exists yet. Seeding them
-- unearned would just be dead config nobody can ever unlock.

insert into public.achievements (key, name, description, icon, criteria)
values
  ('FIRST_QUEST', 'First Quest', 'Submitted your first quest for review.', '🗺️', '{"type": "first_evaluation"}'),
  ('FIRST_WIN', 'First Win', 'Passed your first quest.', '🏆', '{"type": "first_pass"}'),
  ('STREAK_3', '3-Day Streak', 'Completed quests 3 days in a row.', '🔥', '{"type": "streak", "days": 3}'),
  ('STREAK_7', '7-Day Streak', 'Completed quests 7 days in a row.', '🔥', '{"type": "streak", "days": 7}'),
  ('LEVEL_5', 'Level 5', 'Reached level 5.', '⭐', '{"type": "level", "level": 5}'),
  ('LEVEL_10', 'Level 10', 'Reached level 10.', '🌟', '{"type": "level", "level": 10}')
on conflict (key) do nothing;
