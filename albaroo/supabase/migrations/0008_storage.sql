-- Private storage bucket for submission photos. All reads happen via signed URLs
-- minted server-side (see src/lib/supabase/admin.ts + the photo API routes) after an
-- application-level permission check identical to the RLS above — the browser never
-- talks to Storage directly, uploads go through /api/photos/upload so the server can
-- stamp server_captured_at, hash the file, and generate the thumbnail before it lands.
--
-- These storage.objects policies are defense in depth for the (unsupported) case of a
-- client hitting the Storage REST API directly with its own JWT instead of going
-- through our API routes. Path convention:
--   {company_id}/{branch_id}/{assignment_id}/{submission_id_or_pending}/{uuid}.webp
insert into storage.buckets (id, name, public)
values ('submission-photos', 'submission-photos', false)
on conflict (id) do nothing;

create policy submission_photos_storage_select on storage.objects for select
  using (
    bucket_id = 'submission-photos'
    and (
      is_admin()
      or has_branch_access((storage.foldername(name))[2]::uuid)
    )
  );

create policy submission_photos_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'submission-photos'
    and (storage.foldername(name))[1]::uuid = current_profile_company()
  );
