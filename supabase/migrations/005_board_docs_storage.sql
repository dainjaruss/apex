-- Migration 005: 'board-docs' storage bucket + owner-folder policy
--
-- Split out of 004 (v1.1 review fix): `create policy ... on storage.objects`
-- requires ownership of storage.objects. On the local Supabase CLI stack the
-- migration role is superuser and this file applies cleanly; on hosted Supabase
-- projects the migration role often cannot manage storage policies and `db push`
-- of these statements fails with `must be owner of table objects`. Keeping them
-- in their own migration means such a failure can no longer roll back the 004
-- tables — they are unaffected either way.
--
-- Where this migration cannot be applied, create the 'board-docs' bucket and
-- the identical owner-folder policy through the dashboard (Storage -> Policies)
-- using this file as the normative reference.
--
-- First bucket in this project (evaluations.pdf_storage_path is a dead column;
-- nothing else uses Storage). Private; each user may only touch objects under a
-- folder named with their own auth uid: board-docs/<auth.uid()>/<filename>.

insert into storage.buckets (id, name, public)
    values ('board-docs', 'board-docs', false)
    on conflict (id) do nothing;

drop policy if exists board_docs_owner_rw on storage.objects;
create policy board_docs_owner_rw on storage.objects
    for all to authenticated
    using (
        bucket_id = 'board-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'board-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
