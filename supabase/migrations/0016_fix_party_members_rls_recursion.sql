-- ---------------------------------------------------------------------
-- Fixes "infinite recursion detected in policy for relation
-- party_members" (Postgres 42P17), live in production since 0014.
-- party_members_select_fellow_members's own USING clause queried
-- party_members again to find the caller's party ids — Postgres has to
-- apply party_members' RLS policy to evaluate that inner query too,
-- which means evaluating the same policy again, forever. This broke
-- every RLS-scoped read that goes anywhere near "which party is
-- auth.uid() in": party_members's own SELECT policy, and everything
-- built on the same pattern (profiles_select_partymates,
-- streaks_select_partymates, kudos_select_involved_or_partymate) —
-- in practice, ANY select against profiles/streaks/kudos under RLS,
-- since Postgres OR's permissive policies together and doesn't
-- guarantee it skips evaluating the recursive one.
--
-- Fix: move "which party ids is auth.uid() in" into a SECURITY
-- DEFINER function. It runs with the function owner's privileges, so
-- its internal query bypasses RLS entirely instead of re-triggering
-- the policy that calls it.
-- ---------------------------------------------------------------------

create or replace function public.my_party_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select party_id from public.party_members where user_id = auth.uid()
$$;

grant execute on function public.my_party_ids() to authenticated;

drop policy if exists "party_members_select_fellow_members" on public.party_members;
create policy "party_members_select_fellow_members" on public.party_members
  for select using (
    auth.uid() = user_id
    or party_id in (select public.my_party_ids())
  );
