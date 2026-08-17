-- ASCEND initial schema (Phase 2)
-- Every user-owned table has RLS enabled with policies scoped to auth.uid().
-- Config tables (skills, levels, achievements) are readable by any
-- authenticated user but writable only by the service role (admin client).
-- xp_transactions / ai_evaluations / quests are written by the server
-- (service role) only — users never insert these directly, per Phase 4/14's
-- "server independently enforces XP limits" rule.

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  avatar_url text,
  preferred_language text default 'en',
  occupation text,
  primary_objective text,
  level integer not null default 1,
  xp integer not null default 0,
  current_goal_id uuid, -- FK added after goals is created
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  target_value text,
  target_days integer,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  ai_plan jsonb, -- milestones / weekly objectives (Phase 7)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_current_goal_fkey
  foreign key (current_goal_id) references public.goals (id) on delete set null;

alter table public.goals enable row level security;

create policy "goals_select_own" on public.goals
  for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals
  for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- skills (config table, driven by DB per Phase 16 — not hardcoded in UI)
-- ---------------------------------------------------------------------
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'general', -- e.g. 'general', 'culinary'
  icon text,
  requirements jsonb not null default '{}'::jsonb, -- unlock rules
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.skills enable row level security;

create policy "skills_select_authenticated" on public.skills
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- user_skills
-- ---------------------------------------------------------------------
create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  xp integer not null default 0,
  mastery_level integer not null default 0,
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

alter table public.user_skills enable row level security;

create policy "user_skills_select_own" on public.user_skills
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  skill_id uuid references public.skills (id) on delete set null,
  title text not null,
  description text not null,
  objective text not null,
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  estimated_minutes integer not null default 30,
  xp_reward integer not null default 0,
  evidence_required boolean not null default true,
  evidence_type text check (evidence_type in ('text', 'image', 'file', 'url')),
  success_criteria jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  status text not null default 'available'
    check (status in ('available', 'accepted', 'in_progress', 'submitted', 'under_review', 'completed', 'failed')),
  ai_raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quests enable row level security;

create policy "quests_select_own" on public.quests
  for select using (auth.uid() = user_id);
-- Users may only progress a quest through the lifecycle (accept/start/submit),
-- never fabricate one or mark it completed/failed themselves — the server
-- (service role, Phase 14) does that after AI evaluation.
create policy "quests_update_own_lifecycle" on public.quests
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status in ('accepted', 'in_progress', 'submitted')
  );

-- ---------------------------------------------------------------------
-- quest_attempts
-- ---------------------------------------------------------------------
create table if not exists public.quest_attempts (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz
);

alter table public.quest_attempts enable row level security;

create policy "quest_attempts_select_own" on public.quest_attempts
  for select using (auth.uid() = user_id);
create policy "quest_attempts_insert_own" on public.quest_attempts
  for insert with check (auth.uid() = user_id);
create policy "quest_attempts_update_own" on public.quest_attempts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status in ('in_progress', 'submitted'));

-- ---------------------------------------------------------------------
-- quest_evidence
-- ---------------------------------------------------------------------
create table if not exists public.quest_evidence (
  id uuid primary key default gen_random_uuid(),
  quest_attempt_id uuid not null references public.quest_attempts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  evidence_type text not null check (evidence_type in ('text', 'image', 'file', 'url')),
  storage_path text, -- Supabase Storage object path (Phase 13); null for text/url evidence
  content text, -- inline text or URL evidence
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.quest_evidence enable row level security;

create policy "quest_evidence_select_own" on public.quest_evidence
  for select using (auth.uid() = user_id);
create policy "quest_evidence_insert_own" on public.quest_evidence
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- xp_transactions — immutable ledger, server-written only
-- ---------------------------------------------------------------------
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  source_type text not null check (source_type in ('quest_evaluation', 'achievement', 'adjustment')),
  source_id uuid,
  skill_id uuid references public.skills (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.xp_transactions enable row level security;

create policy "xp_transactions_select_own" on public.xp_transactions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy for authenticated users: rows are
-- written exclusively by the server via the service-role client, and are
-- never modified after insert (immutable ledger).

-- ---------------------------------------------------------------------
-- levels (config table)
-- ---------------------------------------------------------------------
create table if not exists public.levels (
  level_number integer primary key,
  xp_required integer not null,
  title text
);

alter table public.levels enable row level security;

create policy "levels_select_authenticated" on public.levels
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- achievements (config table)
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- e.g. FIRST_QUEST, STREAK_7
  name text not null,
  description text,
  icon text,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.achievements enable row level security;

create policy "achievements_select_authenticated" on public.achievements
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- user_achievements — idempotent grants (same achievement never twice)
-- ---------------------------------------------------------------------
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own" on public.user_achievements
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- streaks
-- ---------------------------------------------------------------------
create table if not exists public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "streaks_select_own" on public.streaks
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- ai_evaluations — server-written only
-- ---------------------------------------------------------------------
create table if not exists public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  quest_attempt_id uuid not null references public.quest_attempts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  passed boolean not null,
  score integer not null check (score between 0 and 100),
  feedback text,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  xp_awarded integer not null default 0,
  skill_xp_awarded integer not null default 0,
  next_action text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_evaluations enable row level security;

create policy "ai_evaluations_select_own" on public.ai_evaluations
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- ai_messages — mentor chat history
-- ---------------------------------------------------------------------
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  context jsonb, -- compact context snapshot sent to the AI, not a full DB dump
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

create policy "ai_messages_select_own" on public.ai_messages
  for select using (auth.uid() = user_id);
create policy "ai_messages_insert_own" on public.ai_messages
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- device_permissions
-- ---------------------------------------------------------------------
create table if not exists public.device_permissions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  camera text not null default 'unknown' check (camera in ('unknown', 'granted', 'denied', 'unsupported')),
  microphone text not null default 'unknown' check (microphone in ('unknown', 'granted', 'denied', 'unsupported')),
  motion text not null default 'unknown' check (motion in ('unknown', 'granted', 'denied', 'unsupported')),
  location text not null default 'unknown' check (location in ('unknown', 'granted', 'denied', 'unsupported')),
  notifications text not null default 'unknown' check (notifications in ('unknown', 'granted', 'denied', 'unsupported')),
  updated_at timestamptz not null default now()
);

alter table public.device_permissions enable row level security;

create policy "device_permissions_select_own" on public.device_permissions
  for select using (auth.uid() = user_id);
create policy "device_permissions_upsert_own" on public.device_permissions
  for insert with check (auth.uid() = user_id);
create policy "device_permissions_update_own" on public.device_permissions
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- app_settings — per-user app preferences (sound, reduced motion override, etc.)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sound_enabled boolean not null default false,
  reduced_motion_override boolean,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings_select_own" on public.app_settings
  for select using (auth.uid() = user_id);
create policy "app_settings_upsert_own" on public.app_settings
  for insert with check (auth.uid() = user_id);
create policy "app_settings_update_own" on public.app_settings
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Indexes for common access patterns
-- ---------------------------------------------------------------------
create index if not exists idx_goals_user_id on public.goals (user_id);
create index if not exists idx_quests_user_id_status on public.quests (user_id, status);
create index if not exists idx_quest_attempts_user_id on public.quest_attempts (user_id);
create index if not exists idx_quest_evidence_attempt_id on public.quest_evidence (quest_attempt_id);
create index if not exists idx_xp_transactions_user_id on public.xp_transactions (user_id, created_at desc);
create index if not exists idx_ai_messages_user_id on public.ai_messages (user_id, created_at desc);
create index if not exists idx_user_skills_user_id on public.user_skills (user_id);
