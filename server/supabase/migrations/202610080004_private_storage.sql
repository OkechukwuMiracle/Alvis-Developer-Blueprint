-- Apply on Supabase only (the PostgreSQL test harness has no Storage service).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('alvis-recordings','alvis-recordings',false,104857600,array['video/mp4','video/webm','audio/mp4','audio/webm'])
on conflict(id) do update set public=false,file_size_limit=104857600,allowed_mime_types=excluded.allowed_mime_types;
-- No client Storage policies: only server-issued scoped, five-minute capabilities.
-- Server S3 credentials and service key never reach the browser.
-- Restrictive policy preserves other buckets while overriding any broad pre-existing client policy.
create policy alvis_recordings_capability_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'alvis-recordings') with check(bucket_id<>'alvis-recordings');
