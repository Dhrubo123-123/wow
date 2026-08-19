-- ---------------------------------------------------------------------
-- Retention roadmap item 7 (cont.) — the party page needs to show
-- fellow members' name/level/streak, but profiles/streaks were
-- self-select-only (0001_init.sql). These are additional PERMISSIVE
-- policies (Postgres RLS OR's them with the existing self-only ones),
-- scoped strictly to people sharing a party — never a general "any
-- authenticated user can read any profile" policy.
-- ---------------------------------------------------------------------

create policy "profiles_select_partymates" on public.profiles
  for select using (
    id in (
      select pm2.user_id
      from public.party_members pm1
      join public.party_members pm2 on pm2.party_id = pm1.party_id
      where pm1.user_id = auth.uid()
    )
  );

create policy "streaks_select_partymates" on public.streaks
  for select using (
    user_id in (
      select pm2.user_id
      from public.party_members pm1
      join public.party_members pm2 on pm2.party_id = pm1.party_id
      where pm1.user_id = auth.uid()
    )
  );
