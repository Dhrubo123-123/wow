-- ---------------------------------------------------------------------
-- events — append-only product-analytics log (retention roadmap §0).
-- Every event name used across the app is documented in
-- src/lib/events/names.ts — keep that file and this comment in sync.
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_created_at_idx on public.events (user_id, created_at);
create index if not exists events_name_created_at_idx on public.events (name, created_at);

alter table public.events enable row level security;

-- Users can insert their own events (via the server, using their own
-- session — see src/app/api/events/route.ts) and read their own event
-- history. No update/delete policy — this is an append-only log by
-- design, and no cross-user select policy — aggregate reads go through
-- the admin-client-backed RPCs below instead, gated at the app layer
-- (src/app/admin/metrics/page.tsx) by an email allowlist, not RLS.
create policy "events_insert_own" on public.events
  for insert with check (auth.uid() = user_id);
create policy "events_select_own" on public.events
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Retention cohort + streak distribution RPCs for /admin/metrics.
-- security definer + explicit search_path so these can read auth.users
-- (only place in the app that touches it) without granting broad
-- schema access to any client role. Called only via the service-role
-- admin client from a server-only page — never exposed to `anon`.
-- ---------------------------------------------------------------------
create or replace function public.admin_retention_cohorts()
returns table (
  cohort_date date,
  cohort_size bigint,
  d1_retained bigint,
  d7_retained bigint,
  d30_retained bigint
)
language sql
security definer
set search_path = public, auth
as $$
  with cohorts as (
    select id as user_id, date(created_at) as cohort_date
    from auth.users
  ),
  activity as (
    select distinct user_id, date(created_at) as activity_date
    from public.events
  )
  select
    c.cohort_date,
    count(distinct c.user_id) as cohort_size,
    count(distinct a1.user_id) as d1_retained,
    count(distinct a7.user_id) as d7_retained,
    count(distinct a30.user_id) as d30_retained
  from cohorts c
  left join activity a1 on a1.user_id = c.user_id and a1.activity_date = c.cohort_date + 1
  left join activity a7 on a7.user_id = c.user_id and a7.activity_date = c.cohort_date + 7
  left join activity a30 on a30.user_id = c.user_id and a30.activity_date = c.cohort_date + 30
  group by c.cohort_date
  order by c.cohort_date desc;
$$;

create or replace function public.admin_streak_distribution()
returns table (streak_bucket text, sort_order int, user_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    case
      when current_streak = 0 then '0'
      when current_streak between 1 and 2 then '1-2'
      when current_streak between 3 and 6 then '3-6'
      when current_streak between 7 and 13 then '7-13'
      when current_streak between 14 and 29 then '14-29'
      else '30+'
    end as streak_bucket,
    case
      when current_streak = 0 then 0
      when current_streak between 1 and 2 then 1
      when current_streak between 3 and 6 then 2
      when current_streak between 7 and 13 then 3
      when current_streak between 14 and 29 then 4
      else 5
    end as sort_order,
    count(*) as user_count
  from public.streaks
  group by 1, 2
  order by 2;
$$;

grant execute on function public.admin_retention_cohorts() to service_role;
grant execute on function public.admin_streak_distribution() to service_role;
