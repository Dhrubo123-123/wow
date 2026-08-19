-- ---------------------------------------------------------------------
-- Retention roadmap item 7 — Duo/social. Small parties (join via a
-- short invite code), kudos between members, and a shared streak
-- computed at query time from each member's `streaks` row (no new
-- column needed — "party streak" is just min(current_streak) across
-- members, read live).
--
-- PARTY_INVITED / PARTY_JOINED / KUDOS_GIVEN were already reserved in
-- lib/events/names.ts ahead of this migration.
-- ---------------------------------------------------------------------

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Party',
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.parties enable row level security;

-- Readable by any signed-in user (needed to resolve an invite code
-- before joining) — nothing in this row is sensitive, just a name and
-- a join code.
create policy "parties_select_authenticated" on public.parties
  for select using (auth.role() = 'authenticated');
create policy "parties_insert_own" on public.parties
  for insert with check (created_by = auth.uid());

create table if not exists public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

alter table public.party_members enable row level security;

create policy "party_members_select_fellow_members" on public.party_members
  for select using (
    auth.uid() = user_id
    or party_id in (select pm.party_id from public.party_members pm where pm.user_id = auth.uid())
  );
create policy "party_members_insert_self" on public.party_members
  for insert with check (auth.uid() = user_id);
create policy "party_members_delete_self" on public.party_members
  for delete using (auth.uid() = user_id);

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.kudos enable row level security;

create policy "kudos_select_involved_or_partymate" on public.kudos
  for select using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or party_id in (select pm.party_id from public.party_members pm where pm.user_id = auth.uid())
  );
create policy "kudos_insert_own" on public.kudos
  for insert with check (auth.uid() = from_user_id);

create index if not exists party_members_user_id_idx on public.party_members (user_id);
create index if not exists kudos_party_id_idx on public.kudos (party_id);
create index if not exists kudos_to_user_id_idx on public.kudos (to_user_id);
