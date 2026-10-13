-- Test harness for PostgreSQL, not a replacement for Supabase authentication.
-- Apply only in a disposable database named alvis_test.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to authenticated;
-- Match Supabase's permissive default function ACLs, so PUBLIC-only revokes cannot produce false-positive authorization tests.
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
