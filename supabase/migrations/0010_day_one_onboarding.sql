-- ---------------------------------------------------------------------
-- Retention roadmap item 2 — day-one guaranteed win.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists preferred_quest_time text, -- "HH:MM", 24h, local-naive
  add column if not exists starter_quest_completed_at timestamptz;

comment on column public.profiles.preferred_quest_time is
  'User-chosen "when do you usually have time" answer from onboarding, HH:MM 24h. Drives roadmap item 5''s stable daily quest-unlock time and item 6''s reminder timing.';
comment on column public.profiles.starter_quest_completed_at is
  'Set once the day-one starter quest is completed — gates "1 starter eval per anon session" (roadmap item 2''s anon-auth mitigation) independent of the general per-user evaluations budget.';

insert into public.achievements (key, name, description, icon)
values ('FIRST_EMBER', 'First Ember', 'Completed your very first quest in your very first session.', '🔥')
on conflict (key) do nothing;

-- RLS audit (roadmap item 2 requirement): every existing policy that
-- scopes by `auth.uid() = user_id` already covers anonymous sessions
-- correctly — Supabase anonymous users are real auth.users rows with a
-- real auth.uid(), carrying the standard `authenticated` JWT role (only
-- the `is_anonymous` claim differs), so `auth.uid() = user_id` and
-- `auth.role() = 'authenticated'` policies (used for the read-only
-- skills/achievements reference tables) both already include them with
-- zero policy changes needed. Confirmed by inspecting every migration
-- for role-based exclusions before enabling anonymous auth — none found.
