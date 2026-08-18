-- ASCEND skill catalog seed (Phase 16)
-- Config data, not hardcoded into the UI — /skills renders whatever is
-- in this table. Idempotent: safe to re-run.

insert into public.skills (key, name, description, category, icon, requirements, sort_order)
values
  ('execution', 'Execution', 'Turning intent into completed action.', 'general', '⚡', '{"mastery_xp": 1000}', 1),
  ('consistency', 'Consistency', 'Showing up day after day.', 'general', '🔥', '{"mastery_xp": 1000}', 2),
  ('research', 'Research', 'Finding and applying the right information.', 'general', '🔍', '{"mastery_xp": 1000}', 3),
  ('communication', 'Communication', 'Explaining, persuading, and connecting.', 'general', '💬', '{"mastery_xp": 1000}', 4),
  ('focus', 'Focus', 'Sustained attention on what matters.', 'general', '🎯', '{"mastery_xp": 1000}', 5),
  ('creativity', 'Creativity', 'Generating novel, useful ideas.', 'general', '✨', '{"mastery_xp": 1000}', 6)
on conflict (key) do nothing;
