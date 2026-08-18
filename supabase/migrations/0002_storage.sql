-- ASCEND evidence storage (Phase 13)
-- Private bucket for quest evidence images/files. Objects are keyed
-- `${user_id}/${quest_attempt_id}/${filename}` so RLS can scope access
-- to the owning user without a lookup join.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quest-evidence',
  'quest-evidence',
  false, -- private: every read goes through a signed URL, never a public one
  10485760, -- 10 MB — enforced by Storage itself, not just client-side
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by default in every Supabase
-- project; these policies scope access to the path's leading user_id
-- segment, matching the upload path convention above.

drop policy if exists "quest_evidence_select_own" on storage.objects;
create policy "quest_evidence_select_own" on storage.objects
  for select using (
    bucket_id = 'quest-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "quest_evidence_insert_own" on storage.objects;
create policy "quest_evidence_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'quest-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update/delete policy: evidence is immutable once uploaded, matching
-- xp_transactions' "never modified after insert" posture (Phase 2).
