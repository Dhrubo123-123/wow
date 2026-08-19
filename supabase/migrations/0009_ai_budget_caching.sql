-- ---------------------------------------------------------------------
-- Retention roadmap item A — AI budget protection caches. Neither
-- table has any public RLS policy: both are accessed exclusively via
-- the service-role admin client from server-only code (lib/ai/*), so
-- row security is enforced by "no policy = no access to anon/
-- authenticated roles" rather than an explicit policy set.
-- ---------------------------------------------------------------------

create table if not exists public.quest_template_cache (
  id uuid primary key default gen_random_uuid(),
  category text not null,       -- fitness | cooking | learning | productivity | other
  difficulty smallint not null, -- 1-5, matches quests.difficulty
  day_index integer not null,   -- 0 = starter quest, 1 = day-2 quest, etc.
  template jsonb not null,      -- the cached QuestGeneration shape from lib/ai/schemas.ts
  created_at timestamptz not null default now(),
  unique (category, difficulty, day_index)
);
alter table public.quest_template_cache enable row level security;

create table if not exists public.mentor_faq_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_question text not null unique, -- lowercased, trimmed, whitespace-collapsed
  answer text not null,
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mentor_faq_cache enable row level security;

create index if not exists quest_template_cache_lookup_idx
  on public.quest_template_cache (category, difficulty, day_index);
