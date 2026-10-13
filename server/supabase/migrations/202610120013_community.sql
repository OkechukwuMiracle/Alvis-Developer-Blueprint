-- Explicit scopes preserve existing organization records and job identifiers.
alter table public.organizations add column scope_kind text not null default 'organization'
 check(scope_kind in ('organization','personal'));
alter table public.organizations add column personal_owner uuid references auth.users(id);
alter table public.organizations add constraint personal_scope_owner check
 ((scope_kind='organization' and personal_owner is null) or (scope_kind='personal' and personal_owner is not null));
create unique index one_personal_scope on public.organizations(personal_owner) where scope_kind='personal';

create table public.community_profiles (
 user_id uuid primary key references auth.users(id), display_name text not null check(length(trim(display_name)) between 2 and 100),
 role text not null check(role in ('expert','reviewer','worker')), bio text not null default '' check(length(bio)<=1000),
 created_at timestamptz not null default now()
);
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from anon,authenticated;
grant select on public.community_profiles to anon,authenticated;
create policy public_profiles on public.community_profiles for select using(true);

-- All old content is explicitly private; no null-scope inference is used.
alter table public.captures add column audience text not null default 'organization_private' check(audience in ('organization_private','personal_private'));
alter table public.sources add column audience text not null default 'organization_private' check(audience in ('organization_private','personal_private'));
alter table public.knowledge_revisions add column audience text not null default 'organization_private' check(audience in ('organization_private','personal_private'));
create function public.alvis_private_audience() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 new.audience:=case when exists(select 1 from organizations where id=new.organization_id and scope_kind='personal') then 'personal_private' else 'organization_private' end;
 return new;
end $$;
create trigger capture_audience before insert or update on public.captures for each row execute function public.alvis_private_audience();
create trigger source_audience before insert or update on public.sources for each row execute function public.alvis_private_audience();
create trigger revision_audience before insert or update on public.knowledge_revisions for each row execute function public.alvis_private_audience();

create function public.alvis_activate_personal(person_name text,community_role text) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare scope uuid; site uuid; chosen text;
begin
 perform alvis_verified_email();
 if community_role not in ('expert','reviewer','worker') or length(trim(person_name)) not between 2 and 100 then raise exception 'ALVIS: Invalid personal profile'; end if;
 -- A per-user lock makes interrupted/duplicate activation idempotent.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 insert into community_profiles(user_id,display_name,role) values(auth.uid(),trim(person_name),community_role) on conflict(user_id) do nothing;
 select role into chosen from community_profiles where user_id=auth.uid();
 select id into scope from organizations where personal_owner=auth.uid() and scope_kind='personal';
 if scope is not null then return scope; end if;
 insert into organizations(name,scope_kind,personal_owner) values('Personal workspace','personal',auth.uid()) returning id into scope;
 insert into memberships(organization_id,user_id,role,display_name) values(scope,auth.uid(),chosen::member_role,trim(person_name));
 insert into sites(organization_id,name) values(scope,'Personal subjects') returning id into site;
 insert into assets(organization_id,site_id,code,name,simulation_only) values(scope,site,'PERSONAL','Personal task / equipment',true);
 return scope;
end $$;

-- Community roles affect only their owner's personal storage scope.
create or replace function public.alvis_role(org uuid) returns public.member_role
language sql stable security definer set search_path=public,pg_catalog as $$
 select case when o.scope_kind='personal' then (select p.role::member_role from community_profiles p where p.user_id=auth.uid() and o.personal_owner=auth.uid())
 else (select m.role from memberships m where m.organization_id=org and m.user_id=auth.uid() and m.revoked_at is null) end
 from organizations o where o.id=org
$$;

create table public.community_publications (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.organizations(id),
 revision_id uuid not null unique references public.knowledge_revisions(id), author_id uuid not null references public.community_profiles(user_id),
 audience text not null default 'community_public' check(audience='community_public'),
 state text not null default 'pending' check(state in ('pending','approved','changes','rejected','withdrawn')),
 content jsonb not null, content_hash text not null, excerpts jsonb not null check(jsonb_typeof(excerpts)='array'),
 topic text not null, equipment text not null, share_ack_at timestamptz not null, reviewer_evidence_ack_at timestamptz not null,
 assigned_reviewer uuid references public.community_profiles(user_id), reviewed_by uuid references public.community_profiles(user_id),
 reviewed_at timestamptz, created_at timestamptz not null default now(),
 check(author_id is distinct from assigned_reviewer), check(author_id is distinct from reviewed_by)
);
create table public.community_reviews (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null references public.community_publications(id),
 reviewer_id uuid not null references public.community_profiles(user_id), decision text not null check(decision in ('approve','request_changes','reject')),
 reason text not null, content_hash text not null, created_at timestamptz not null default now()
);
create table public.community_guides (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), publication_id uuid not null references public.community_publications(id),
 state text not null default 'active' check(state in ('active','completed','stopped','invalidated')), position integer not null default 0,
 outcome text, started_at timestamptz not null default now(), finished_at timestamptz,
 request_id uuid not null, unique(user_id,request_id)
);
create table public.community_lessons (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null references public.community_publications(id),
 content jsonb not null, authored_by uuid not null references auth.users(id), content_hash text not null,
 state text not null default 'draft' check(state in ('draft','approved','rejected')), approved_by uuid references auth.users(id),
 approved_at timestamptz, reason text, created_at timestamptz not null default now(), check(authored_by is distinct from approved_by)
);
create table public.community_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), lesson_id uuid not null references public.community_lessons(id),
 submission_key uuid not null, responses jsonb not null, correct_count integer not null check(correct_count between 0 and 3),
 completed_at timestamptz not null default now(), unique(user_id,submission_key)
);
create table public.community_answers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), query text not null,
 answer jsonb not null, revision_ids uuid[] not null, created_at timestamptz not null default now()
);

create function public.alvis_community_visible(publication uuid) returns boolean
language sql stable security definer set search_path=public,pg_catalog as $$
 select exists(select 1 from community_publications p join organizations o on o.id=p.scope_id and o.scope_kind='personal' and o.personal_owner=p.author_id
 join knowledge_revisions r on r.id=p.revision_id and r.organization_id=p.scope_id
 join knowledge_units u on u.id=r.unit_id and u.active_revision_id=r.id
 where p.id=publication and p.audience='community_public' and p.state='approved' and r.status='approved' and r.index_ready and r.content_hash=p.content_hash)
$$;
alter table public.community_publications enable row level security;
revoke all on public.community_publications from anon,authenticated;
grant select on public.community_publications to anon,authenticated;
grant select on public.community_publications to service_role;
create policy publication_read on public.community_publications for select using
 (alvis_community_visible(id) or author_id=auth.uid() or (state='pending' and author_id<>auth.uid()
 and (assigned_reviewer is null or assigned_reviewer=auth.uid()) and exists(select 1 from community_profiles p where p.user_id=auth.uid() and p.role='reviewer')));
do $$ declare t text; begin
 foreach t in array array['community_reviews','community_guides','community_lessons','community_attempts','community_answers'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

create function public.alvis_submit_community(revision uuid, expected_hash text, selections jsonb, topic text,equipment text,share_ack boolean,evidence_ack boolean) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare r knowledge_revisions; p uuid; selected jsonb:='[]'; item jsonb; s sources; evidence text;
begin
 perform alvis_verified_email();
 select * into r from knowledge_revisions where id=revision for update;
 if not found or r.created_by<>auth.uid() or not exists(select 1 from organizations o join community_profiles cp on cp.user_id=o.personal_owner where o.id=r.organization_id and o.scope_kind='personal' and o.personal_owner=auth.uid() and cp.role='expert') then raise exception 'ALVIS: Personal expert ownership required'; end if;
 if not share_ack or not evidence_ack or share_ack is null or evidence_ack is null then raise exception 'ALVIS: Explicit sharing and reviewer evidence acknowledgements required'; end if;
 if r.content_hash is distinct from expected_hash or r.status<>'draft' then raise exception 'ALVIS: Refresh the draft'; end if;
 if length(trim(topic)) not between 2 and 100 or length(trim(equipment)) not between 2 and 100 or jsonb_typeof(selections)<>'array' or jsonb_array_length(selections) not between 1 and 100 then raise exception 'ALVIS: Invalid public preview'; end if;
 perform alvis_validate_content(r.content,r.organization_id,r.id,true);
 for item in select value from jsonb_array_elements(selections) loop
 select s0.* into s from sources s0 join revision_sources rs on rs.source_id=s0.id and rs.organization_id=s0.organization_id
 where rs.revision_id=r.id and s0.organization_id=r.organization_id and s0.id=(item->>'id')::uuid and s0.withdrawn_at is null;
 if not found or coalesce(length(trim(item->>'excerpt')),0) not between 1 and 4000 or position(item->>'excerpt' in coalesce(s.text_content,''))=0 then raise exception 'ALVIS: Select actual supporting text excerpts'; end if;
 selected:=selected||jsonb_build_array(jsonb_build_object('id',s.id,'text_content',item->>'excerpt','locator',s.kind||' excerpt','start_ms',s.start_ms,'end_ms',s.end_ms,'synthetic',s.synthetic));
 end loop;
 for evidence in select distinct value #>> '{}' from jsonb_path_query(r.content,'$.**.evidence_ids[*]') value loop
 if not exists(select 1 from jsonb_array_elements(selected) x where x->>'id'=evidence) then raise exception 'ALVIS: All cited claims require explicitly selected evidence'; end if;
 end loop;
 insert into community_publications(scope_id,revision_id,author_id,content,content_hash,excerpts,topic,equipment,share_ack_at,reviewer_evidence_ack_at)
 values(r.organization_id,r.id,auth.uid(),r.content,r.content_hash,selected,trim(topic),trim(equipment),now(),now())
 on conflict(revision_id) do update set state='pending',content=excluded.content,content_hash=excluded.content_hash,excerpts=excluded.excerpts,topic=excluded.topic,equipment=excluded.equipment,share_ack_at=now(),reviewer_evidence_ack_at=now(),assigned_reviewer=null,reviewed_by=null,reviewed_at=null returning id into p;
 update knowledge_revisions set status='pending' where id=r.id;
 return p;
end $$;

create function public.alvis_review_community(publication uuid,operation text,expected_hash text,reason text) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare p community_publications; r knowledge_revisions; u knowledge_units;
begin
 perform alvis_verified_email();
 if not exists(select 1 from community_profiles where user_id=auth.uid() and role='reviewer') then raise exception 'ALVIS: Community reviewer required'; end if;
 select * into p from community_publications where id=publication for update;
 if not found or p.author_id=auth.uid() or p.state<>'pending' or (p.assigned_reviewer is not null and p.assigned_reviewer<>auth.uid()) then raise exception 'ALVIS: Review unavailable'; end if;
 if operation='claim' then update community_publications set assigned_reviewer=auth.uid() where id=p.id; return p.id; end if;
 if p.assigned_reviewer is distinct from auth.uid() or p.content_hash is distinct from expected_hash or operation not in ('approve','request_changes','reject') or coalesce(length(trim(reason)),0) not between 1 and 2000 then raise exception 'ALVIS: Assigned reviewer, reason and current version required'; end if;
 select * into r from knowledge_revisions where id=p.revision_id;
 select * into u from knowledge_units where id=r.unit_id for update;
 select * into r from knowledge_revisions where id=p.revision_id for update;
 if r.status<>'pending' or r.content_hash is distinct from p.content_hash or r.organization_id<>p.scope_id then raise exception 'ALVIS: Content changed'; end if;
 if operation='approve' then
 perform alvis_validate_content(r.content,r.organization_id,r.id,true);
 if exists(select 1 from knowledge_revisions where id=u.active_revision_id and version>=r.version) then raise exception 'ALVIS: A newer revision is already active'; end if;
 update knowledge_revisions set status='retired',index_ready=false where id=u.active_revision_id;
 update knowledge_revisions set status='approved',index_ready=false where id=r.id;
 update knowledge_units set active_revision_id=r.id where id=u.id;
 insert into processing_jobs(organization_id,revision_id,stage,dedupe_key,payload) values(r.organization_id,r.id,'index',r.id::text||':index:v1',jsonb_build_object('content_hash',r.content_hash)) on conflict(organization_id,dedupe_key) do nothing;
 update community_publications set state='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
 else
 update knowledge_revisions set status=case when operation='reject' then 'rejected'::revision_state else 'draft'::revision_state end where id=r.id;
 update community_publications set state=case when operation='reject' then 'rejected' else 'changes' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
 end if;
 insert into community_reviews(publication_id,reviewer_id,decision,reason,content_hash) values(p.id,auth.uid(),operation,trim(reason),p.content_hash);
 return p.id;
end $$;

create function public.alvis_withdraw_community(publication uuid) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare p community_publications;
begin
 select * into p from community_publications where id=publication and author_id=auth.uid() for update;
 if not found then raise exception 'ALVIS: Unavailable'; end if;
 update community_publications set state='withdrawn' where id=p.id;
 update knowledge_revisions set status='retired',index_ready=false where id=p.revision_id;
 update knowledge_units set active_revision_id=null where active_revision_id=p.revision_id;
 update community_guides set state='invalidated',finished_at=coalesce(finished_at,now()) where publication_id=p.id and state='active';
 return p.id;
end $$;
create function public.alvis_community_retirement() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if new.status='retired' then
 update community_publications set state='withdrawn' where revision_id=new.id;
 update community_guides set state='invalidated',finished_at=coalesce(finished_at,now()) where publication_id in(select id from community_publications where revision_id=new.id) and state='active';
 end if; return new;
end $$;
create trigger community_retire after update of status on public.knowledge_revisions for each row execute function public.alvis_community_retirement();

-- An old organization endpoint cannot publish personal content implicitly.
alter function public.alvis_transition(uuid,text,jsonb,text,text,text) rename to alvis_organization_transition;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.alvis_organization_transition(uuid,text,jsonb,text,text,text)'::regprocedure);
 execute replace(definition,'alvis_transition.','alvis_organization_transition.');
end $$;
revoke all on function public.alvis_organization_transition(uuid,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
create function public.alvis_transition(revision uuid,operation text,payload jsonb,expected_hash text,comment text,request_key text) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if operation in ('submit','approve','reject','request_changes') and exists(select 1 from knowledge_revisions r join organizations o on o.id=r.organization_id where r.id=revision and o.scope_kind='personal') then raise exception 'ALVIS: Use explicit community sharing and review'; end if;
 return alvis_organization_transition(revision,operation,payload,expected_hash,comment,request_key);
end $$;

-- Explicit allowlists; no new RPC inherits Supabase's permissive default ACL.
revoke all on function public.alvis_private_audience(),public.alvis_activate_personal(text,text),public.alvis_community_visible(uuid),public.alvis_submit_community(uuid,text,jsonb,text,text,boolean,boolean),public.alvis_review_community(uuid,text,text,text),public.alvis_withdraw_community(uuid),public.alvis_community_retirement(),public.alvis_transition(uuid,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.alvis_activate_personal(text,text),public.alvis_submit_community(uuid,text,jsonb,text,text,boolean,boolean),public.alvis_review_community(uuid,text,text,text),public.alvis_withdraw_community(uuid),public.alvis_transition(uuid,text,jsonb,text,text,text) to authenticated;
grant execute on function public.alvis_community_visible(uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
