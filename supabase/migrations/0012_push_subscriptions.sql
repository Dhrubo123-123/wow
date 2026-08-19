-- ---------------------------------------------------------------------
-- Retention roadmap item 6 — opt-in Web Push. Subscriptions are the
-- browser-issued PushSubscription (endpoint + keys), stored per user
-- so the daily reminder cron can look up who to notify. Purely
-- opt-in: no row exists until the user explicitly grants permission
-- and subscribes client-side.
-- ---------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
