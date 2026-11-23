-- Private Storage bucket "files" for files Ahlam uploads from the "+ إضافة" form (50 MB each).
-- Same access model as `items`: only signed-in users (sign-ups are disabled, so only her). No anon/public access;
-- the page opens a file with a short-lived signed URL. Safe to run again.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists files_owner_select on storage.objects;
drop policy if exists files_owner_insert on storage.objects;
drop policy if exists files_owner_update on storage.objects;
drop policy if exists files_owner_delete on storage.objects;
create policy files_owner_select on storage.objects for select to authenticated using (bucket_id = 'files');
create policy files_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'files');
create policy files_owner_update on storage.objects for update to authenticated using (bucket_id = 'files') with check (bucket_id = 'files');
create policy files_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'files');
