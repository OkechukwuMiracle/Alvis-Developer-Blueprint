-- Alvis Week 1 foundation derived from reference schema v1. Fresh development database.
-- Validated by the isolated PostgreSQL workflow tests; see README for Auth verification.
-- Vector table and extension are deferred to supabase/deferred/embedding.sql.
create type public.member_role as enum ('admin','expert','reviewer','worker');
create type public.revision_state as enum ('draft','pending','approved','rejected','retired');
create type public.job_state as enum ('queued','running','succeeded','failed','cancelled');
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null,
 demo_only boolean not null default false, created_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id), role public.member_role not null,
 display_name text not null, primary key(organization_id,user_id)
);
create table public.sites (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, unique(organization_id,id)
);
create table public.assets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 site_id uuid not null, code text not null, name text not null, simulation_only boolean not null default true,
 foreign key(organization_id,site_id) references public.sites(organization_id,id),
 unique(organization_id,code), unique(organization_id,id)
);
create table public.captures (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 asset_id uuid not null, owner_id uuid not null, title text not null,
 storage_key text, consent_at timestamptz not null, consent_version text not null,
 state text not null check(state in ('uploading','queued','processing','debrief','review','done','failed','deleted')),
 duration_seconds integer check(duration_seconds between 1 and 180),
 content_hash text, created_at timestamptz not null default now(),
 foreign key(organization_id,asset_id) references public.assets(organization_id,id),
 foreign key(organization_id,owner_id) references public.memberships(organization_id,user_id),
 unique(organization_id,id)
);
create table public.sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 capture_id uuid, kind text not null check(kind in ('transcript','frame','debrief','expert_note','manual')),
 locator text not null, text_content text, storage_key text,
 start_ms integer check(start_ms>=0), end_ms integer,
 synthetic boolean not null default false, created_at timestamptz not null default now(),
 check(end_ms is null or (start_ms is not null and end_ms>=start_ms)),
 foreign key(organization_id,capture_id) references public.captures(organization_id,id),
 unique(organization_id,id)
);
create table public.debrief_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 capture_id uuid not null, sequence integer not null check(sequence between 1 and 5),
 target_field text not null, question text not null, answer_text text, answer_source_id uuid,
 foreign key(organization_id,capture_id) references public.captures(organization_id,id),
 foreign key(organization_id,answer_source_id) references public.sources(organization_id,id),
 unique(capture_id,sequence), unique(organization_id,id)
);
create table public.knowledge_units (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 asset_id uuid not null, code text not null, active_revision_id uuid,
 created_at timestamptz not null default now(),
 foreign key(organization_id,asset_id) references public.assets(organization_id,id),
 unique(organization_id,code), unique(organization_id,id)
);
create table public.knowledge_revisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 unit_id uuid not null, capture_id uuid, version integer not null check(version>0),
 status public.revision_state not null default 'draft',
 content jsonb not null check(jsonb_typeof(content)='object'),
 index_ready boolean not null default false, created_by uuid not null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,unit_id) references public.knowledge_units(organization_id,id),
 foreign key(organization_id,capture_id) references public.captures(organization_id,id),
 foreign key(organization_id,created_by) references public.memberships(organization_id,user_id),
 unique(unit_id,version), unique(organization_id,id), unique(organization_id,unit_id,id)
);
alter table public.knowledge_units add constraint active_revision_belongs_to_unit
 foreign key(organization_id,id,active_revision_id)
 references public.knowledge_revisions(organization_id,unit_id,id) deferrable initially deferred;
create unique index one_approved_revision on public.knowledge_revisions(unit_id) where status='approved';
create table public.revision_sources (
 organization_id uuid not null, revision_id uuid not null, source_id uuid not null,
 primary key(revision_id,source_id),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 foreign key(organization_id,source_id) references public.sources(organization_id,id)
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 revision_id uuid not null, reviewer_id uuid not null,
 decision text not null check(decision in ('approve','request_changes','reject','retire')),
 comment text not null, content_hash text not null, created_at timestamptz not null default now(),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 foreign key(organization_id,reviewer_id) references public.memberships(organization_id,user_id),
 unique(organization_id,id)
);

-- At demo scale exact vector scanning is adequate; add HNSW after measurement.
create table public.ask_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 worker_id uuid not null, asset_id uuid, query text not null,
 response jsonb, retrieved_revision_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 foreign key(organization_id,worker_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,asset_id) references public.assets(organization_id,id),
 unique(organization_id,id)
);
create table public.guide_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 worker_id uuid not null, revision_id uuid not null,
 state text not null check(state in ('active','completed','stopped','invalidated')),
 step_position integer not null default 0, outcome text,
 started_at timestamptz not null default now(), finished_at timestamptz,
 foreign key(organization_id,worker_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 unique(organization_id,id)
);
create table public.lessons (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 revision_id uuid not null, content jsonb not null, approved_by uuid,
 approved_at timestamptz, created_at timestamptz not null default now(),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 foreign key(organization_id,approved_by) references public.memberships(organization_id,user_id),
 check((approved_at is null)=(approved_by is null)), unique(organization_id,id)
);
create table public.assessment_attempts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 worker_id uuid not null, lesson_id uuid not null,
 responses jsonb not null, correct_count integer not null check(correct_count between 0 and 3),
 question_count integer not null default 3 check(question_count=3),
 completed_at timestamptz not null default now(),
 foreign key(organization_id,worker_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,lesson_id) references public.lessons(organization_id,id),
 unique(organization_id,id)
);
create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 capture_id uuid, revision_id uuid,
 stage text not null check(stage in ('media','transcribe','extract','debrief','index','lesson')),
 status public.job_state not null default 'queued', dedupe_key text not null,
 attempts integer not null default 0, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 error_code text, created_at timestamptz not null default now(),
 foreign key(organization_id,capture_id) references public.captures(organization_id,id),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 unique(organization_id,dedupe_key), unique(organization_id,id)
);
create table public.ai_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 job_id uuid, task text not null, model text not null, prompt_version text not null,
 input_tokens integer, output_tokens integer, latency_ms integer, error_code text,
 created_at timestamptz not null default now(),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid, action text not null, entity_type text not null, entity_id uuid,
 metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id)
);
-- Approved content cannot be edited in place. Server publication can retire it.
create function public.protect_reviewed_content() returns trigger language plpgsql as $$
begin
 if old.status in ('approved','retired') and new.content is distinct from old.content then
  raise exception 'Reviewed content is immutable; create a new revision';
 end if;
 return new;
end $$;
create trigger protect_reviewed_content before update on public.knowledge_revisions
 for each row execute function public.protect_reviewed_content();
-- Membership helper avoids recursive membership RLS. No user supplied role input.
create function public.alvis_role(org uuid) returns public.member_role
 language sql stable security definer set search_path=public as $$
 select role from public.memberships where organization_id=org and user_id=auth.uid()
$$;
revoke all on function public.alvis_role(uuid) from public;
grant execute on function public.alvis_role(uuid) to authenticated;
-- All client writes are denied. Verified server handlers perform mutations.
-- The service role bypasses RLS, so every server query must apply membership and tenant filters.
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
create policy org_read on public.organizations for select to authenticated
 using(public.alvis_role(id) is not null);
create policy membership_read on public.memberships for select to authenticated
 using(user_id=auth.uid() or public.alvis_role(organization_id) in ('admin','reviewer'));
do $$ declare t text; begin
 foreach t in array array['sites','assets','captures','sources','debrief_items','knowledge_units',
 'knowledge_revisions','revision_sources','reviews','ask_sessions',
 'guide_sessions','lessons','assessment_attempts','processing_jobs','ai_runs','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy site_read on public.sites for select to authenticated using(public.alvis_role(organization_id) is not null);
create policy asset_read on public.assets for select to authenticated using(public.alvis_role(organization_id) is not null);
create policy capture_read on public.captures for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','reviewer') or
 (public.alvis_role(organization_id)='expert' and owner_id=auth.uid()));
create policy revision_read on public.knowledge_revisions for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','reviewer') or
 (public.alvis_role(organization_id)='expert' and created_by=auth.uid()) or
 (public.alvis_role(organization_id) is not null and status='approved' and exists
 (select 1 from public.knowledge_units u where u.id=unit_id and u.active_revision_id=knowledge_revisions.id)));
-- Security definer avoids unit/revision RLS recursion while retaining membership checks.
create function public.alvis_worker_unit_visible(org uuid, unit uuid) returns boolean
 language sql stable security definer set search_path=public as $$
 select public.alvis_role(org) is not null and exists
 (select 1 from public.knowledge_units u join public.knowledge_revisions r
 on r.id=u.active_revision_id and r.organization_id=u.organization_id
 where u.organization_id=org and u.id=unit and r.status='approved' and r.index_ready)
$$;
revoke all on function public.alvis_worker_unit_visible(uuid,uuid) from public;
grant execute on function public.alvis_worker_unit_visible(uuid,uuid) to authenticated;
create policy unit_read on public.knowledge_units for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','expert','reviewer')
 or public.alvis_worker_unit_visible(organization_id,id));
create policy link_read on public.revision_sources for select to authenticated
 using(exists(select 1 from public.knowledge_revisions r where r.id=revision_id));
create policy source_read on public.sources for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','reviewer') or exists
 (select 1 from public.captures c where c.id=capture_id and c.owner_id=auth.uid()) or exists
 (select 1 from public.revision_sources rs where rs.source_id=sources.id));
create policy debrief_read on public.debrief_items for select to authenticated
 using(exists(select 1 from public.captures c where c.id=capture_id));
create policy review_read on public.reviews for select to authenticated
 using(exists(select 1 from public.knowledge_revisions r where r.id=revision_id));

create policy ask_read on public.ask_sessions for select to authenticated
 using(worker_id=auth.uid() or public.alvis_role(organization_id) in ('admin','reviewer'));
create policy guide_read on public.guide_sessions for select to authenticated
 using(worker_id=auth.uid() or public.alvis_role(organization_id) in ('admin','reviewer'));
-- Lessons and answer keys are server-only. Worker lesson endpoint strips keys.
create policy lesson_reviewer_read on public.lessons for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','reviewer'));
create policy attempt_read on public.assessment_attempts for select to authenticated
 using(worker_id=auth.uid() or public.alvis_role(organization_id) in ('admin','reviewer'));
create policy job_read on public.processing_jobs for select to authenticated
 using(public.alvis_role(organization_id) in ('admin','reviewer') or exists
 (select 1 from public.captures c where c.id=capture_id and c.owner_id=auth.uid()));
create policy run_read on public.ai_runs for select to authenticated using(public.alvis_role(organization_id) in ('admin','reviewer'));
create policy audit_read on public.audit_events for select to authenticated using(public.alvis_role(organization_id) in ('admin','reviewer'));
revoke all on all tables in schema public from anon;
revoke insert,update,delete on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
