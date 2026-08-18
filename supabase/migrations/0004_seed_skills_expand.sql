-- ASCEND skill catalog expansion (Phase 16 follow-up)
-- The initial seed (0003) was soft-skill oriented and missed common
-- goal domains (fitness, learning, money) entirely, so AI-generated
-- quests in those domains never matched any skill via matchSkillId —
-- discovered live when a "run a 5K" goal's quests all got skill_id
-- NULL. Idempotent.

insert into public.skills (key, name, description, category, icon, requirements, sort_order)
values
  ('endurance', 'Endurance', 'Sustaining effort over time — cardio, stamina, distance.', 'general', '🏃', '{"mastery_xp": 1000}', 7),
  ('strength', 'Strength', 'Building physical power and resilience.', 'general', '💪', '{"mastery_xp": 1000}', 8),
  ('flexibility', 'Flexibility', 'Mobility, stretching, range of motion.', 'general', '🤸', '{"mastery_xp": 1000}', 9),
  ('learning', 'Learning', 'Acquiring and retaining new knowledge or skills.', 'general', '📚', '{"mastery_xp": 1000}', 10),
  ('financial_literacy', 'Financial Literacy', 'Managing, saving, and growing money.', 'general', '💰', '{"mastery_xp": 1000}', 11)
on conflict (key) do nothing;
