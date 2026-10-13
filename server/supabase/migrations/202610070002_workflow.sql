-- Week 1: no model, vectors, or media jobs. Keyword publication is synchronous.
create table public.review_requests (
 organization_id uuid not null, actor_id uuid not null, request_key text not null,
 revision_id uuid not null, operation text not null, expected_hash text not null, comment text not null,
 primary key(organization_id,actor_id,request_key),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id)
);
alter table public.review_requests enable row level security;
revoke all on public.review_requests from anon,authenticated;
create table public.knowledge_text_index (
 organization_id uuid not null, revision_id uuid primary key, text_content text not null,
 search_terms tsvector generated always as (to_tsvector('english',text_content)) stored,
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id)
);
create index knowledge_text_search on public.knowledge_text_index using gin(search_terms);
alter table public.knowledge_text_index enable row level security;
create policy text_read on public.knowledge_text_index for select to authenticated using(exists(
 select 1 from public.knowledge_revisions r join public.knowledge_units u on u.active_revision_id=r.id
 where r.id=revision_id and r.organization_id=knowledge_text_index.organization_id and r.status='approved' and r.index_ready));
grant select on public.knowledge_text_index to authenticated;
revoke all on public.knowledge_text_index from anon;

-- Repair reference policy: even direct REST reads cannot reveal unindexed worker revisions.
drop policy revision_read on public.knowledge_revisions;
create policy revision_read on public.knowledge_revisions for select to authenticated using(
 public.alvis_role(organization_id) in ('admin','reviewer') or
 (public.alvis_role(organization_id)='expert' and created_by=auth.uid()) or
 (public.alvis_role(organization_id) is not null and status='approved' and index_ready and
 public.alvis_worker_unit_visible(organization_id,unit_id)));

create function public.alvis_content_hash(c jsonb) returns text language sql immutable
 set search_path=pg_catalog as $$ select encode(sha256(convert_to(c::text,'UTF8')),'hex') $$;

-- Fail closed for direct RPC calls as well as server-action validation.
create function public.alvis_validate_content(c jsonb, org uuid, rev uuid, complete boolean)
 returns void language plpgsql set search_path=public,pg_catalog as $$
declare key text; item jsonb; claim jsonb; evidence text; n integer; allowed text[] := array[
 'title','asset_code','task','situation','signal','interpretation','decision','reason','exceptions','outcome',
 'prerequisites','stop_conditions','steps','skill_tags','missing_information','contradictions'];
begin
 if jsonb_typeof(c) is distinct from 'object' or not c ?& allowed or exists(select 1 from jsonb_object_keys(c) k where not k=any(allowed)) then
  raise exception 'ALVIS: Content must match the Knowledge Unit contract'; end if;
 foreach key in array array['title','asset_code','task'] loop
  if jsonb_typeof(c->key) is distinct from 'string' or length(trim(c->>key))=0 then raise exception 'ALVIS: Title, task and asset are required'; end if;
 end loop;
 foreach key in array array['exceptions','prerequisites','stop_conditions','steps','skill_tags','missing_information','contradictions'] loop
  if jsonb_typeof(c->key) is distinct from 'array' then raise exception 'ALVIS: Invalid content list'; end if;
 end loop;
 foreach key in array array['skill_tags','missing_information','contradictions'] loop
  if exists(select 1 from jsonb_array_elements(c->key) x where jsonb_typeof(x)<>'string') then raise exception 'ALVIS: Invalid text list'; end if;
 end loop;
 for claim in select e.value from jsonb_each(c) e where e.key=any(array['situation','signal','interpretation','decision','reason','outcome'])
 union all select value from jsonb_array_elements(c->'exceptions')
 union all select value from jsonb_array_elements(c->'prerequisites')
 union all select value from jsonb_array_elements(c->'stop_conditions') loop
  if jsonb_typeof(claim) is distinct from 'object' or not claim ?& array['text','evidence_ids','basis'] or
   (select count(*) from jsonb_object_keys(claim))<>3 or jsonb_typeof(claim->'evidence_ids') is distinct from 'array' or
   coalesce(claim->>'basis','') not in ('explicit','inferred','unknown') then raise exception 'ALVIS: Invalid claim'; end if;
  if claim->>'basis'='unknown' then
   if claim->'text'<>'null'::jsonb or jsonb_array_length(claim->'evidence_ids')<>0 then raise exception 'ALVIS: Unknown claims must remain empty'; end if;
  elsif jsonb_typeof(claim->'text') is distinct from 'string' or length(trim(claim->>'text'))=0 or jsonb_array_length(claim->'evidence_ids')=0 then
   raise exception 'ALVIS: Known claims require evidence and text'; end if;
 end loop;
 n:=0;
 for item in select value from jsonb_array_elements(c->'steps') loop
  n:=n+1;
  if jsonb_typeof(item) is distinct from 'object' or not item ?& array['order','instruction','rationale','evidence_ids','requires_authorized_person'] or
   (select count(*) from jsonb_object_keys(item))<>5 or jsonb_typeof(item->'evidence_ids') is distinct from 'array' or
   jsonb_typeof(item->'requires_authorized_person') is distinct from 'boolean' or item->'order' is distinct from to_jsonb(n) or
   jsonb_typeof(item->'instruction') is distinct from 'string' or length(trim(item->>'instruction'))=0 or
   jsonb_typeof(item->'rationale') is distinct from 'string' or length(trim(item->>'rationale'))=0 or jsonb_array_length(item->'evidence_ids')=0
   then raise exception 'ALVIS: Steps require order, instruction, rationale and evidence'; end if;
 end loop;
 -- jsonpath includes every nested evidence array; no foreign/unlinked references accepted.
 for item in select * from jsonb_path_query(c,'$.**.evidence_ids[*]') loop
  evidence:=item #>> '{}';
  if jsonb_typeof(item)<>'string' or not exists(select 1 from public.revision_sources rs join public.sources s
   on s.id=rs.source_id and s.organization_id=rs.organization_id
   where rs.organization_id=org and rs.revision_id=rev and rs.source_id::text=evidence) then
   raise exception 'ALVIS: Evidence must be linked to this revision and organization'; end if;
 end loop;
 if complete then
  foreach key in array array['situation','signal','decision','reason'] loop
   if coalesce(length(trim(c->key->>'text')),0)=0 then raise exception 'ALVIS: Recognition, reason and applicability are required'; end if;
  end loop;
  foreach key in array array['exceptions','prerequisites','stop_conditions'] loop
   if jsonb_array_length(c->key)=0 or exists(select 1 from jsonb_array_elements(c->key) x where coalesce(length(trim(x->>'text')),0)=0) then
    raise exception 'ALVIS: Applicability limits, prerequisites and stop conditions are required'; end if;
  end loop;
  if n=0 or jsonb_array_length(c->'missing_information')>0 or jsonb_array_length(c->'contradictions')>0 then
   raise exception 'ALVIS: Resolve missing information and contradictions before submission'; end if;
 end if;
end $$;
revoke all on function public.alvis_validate_content(jsonb,uuid,uuid,boolean) from public;

create function public.alvis_transition(revision uuid, operation text, payload jsonb, expected_hash text, comment text, request_key text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare r public.knowledge_revisions; role public.member_role; u public.knowledge_units; prior public.review_requests; hash text;
begin
 -- Unavailable includes tenant mismatch; role comes only from membership.
 select * into r from public.knowledge_revisions where id=revision and public.alvis_role(organization_id) is not null;
 if not found then raise exception 'ALVIS: Record unavailable'; end if;
 role:=public.alvis_role(r.organization_id);
 -- Unit first, then revision lock: serialize replacement approvals without deadlocks.
 select * into u from public.knowledge_units where id=r.unit_id and organization_id=r.organization_id for update;
 select * into r from public.knowledge_revisions where id=revision and organization_id=u.organization_id for update;
 hash:=public.alvis_content_hash(r.content);
 if operation in ('approve','request_changes','reject') then
  if role<>'reviewer' or r.created_by=auth.uid() then raise exception 'ALVIS: Only a different designated reviewer may review'; end if;
  if length(trim(comment))=0 or length(request_key)<8 or length(request_key)>200 then raise exception 'ALVIS: Review comment and idempotency key required'; end if;
  select * into prior from public.review_requests q where q.organization_id=r.organization_id and q.actor_id=auth.uid() and q.request_key=alvis_transition.request_key;
  if found then
   if prior.revision_id<>revision or prior.operation<>alvis_transition.operation or prior.expected_hash<>alvis_transition.expected_hash or prior.comment<>alvis_transition.comment then
    raise exception 'ALVIS: Idempotency key already used for a different review'; end if;
   return revision;
  end if;
  if r.status<>'pending' then raise exception 'ALVIS: Revision is not waiting for review'; end if;
 elsif operation in ('save','submit') then
  if role<>'expert' or r.created_by<>auth.uid() then raise exception 'ALVIS: Only the owning expert may submit or edit'; end if;
  if r.status<>'draft' then raise exception 'ALVIS: Only a draft can be edited or submitted'; end if;
 else raise exception 'ALVIS: Unsupported operation'; end if;
 if expected_hash is distinct from hash then raise exception 'ALVIS: Content changed; refresh before continuing'; end if;
 if operation in ('submit','approve') and r.content->>'asset_code' is distinct from (select code from public.assets where id=u.asset_id and organization_id=u.organization_id) then
  raise exception 'ALVIS: Content must match the revision asset context'; end if;
 if operation='save' then
  perform public.alvis_validate_content(payload,r.organization_id,r.id,false);
  if payload->>'asset_code' is distinct from (select code from public.assets where id=u.asset_id and organization_id=u.organization_id) then raise exception 'ALVIS: Asset context cannot be changed'; end if;
  update public.knowledge_revisions set content=payload where id=r.id and organization_id=r.organization_id;
 elsif operation='submit' then
  perform public.alvis_validate_content(r.content,r.organization_id,r.id,true);
  update public.knowledge_revisions set status='pending' where id=r.id and organization_id=r.organization_id;
 else
  if operation='approve' then
   perform public.alvis_validate_content(r.content,r.organization_id,r.id,true);
   if exists(select 1 from public.knowledge_revisions where id=u.active_revision_id and organization_id=r.organization_id and version>=r.version) then
    raise exception 'ALVIS: Publish a newer revision than the current version'; end if;
   update public.knowledge_revisions set status='retired',index_ready=false where id=u.active_revision_id and organization_id=r.organization_id;
   update public.guide_sessions set state='invalidated' where revision_id=u.active_revision_id and organization_id=r.organization_id and state='active';
   update public.knowledge_revisions set status='approved' where id=r.id and organization_id=r.organization_id;
   update public.knowledge_units set active_revision_id=r.id where id=r.unit_id and organization_id=r.organization_id;
   insert into public.knowledge_text_index(organization_id,revision_id,text_content) values(r.organization_id,r.id,r.content::text);
   update public.knowledge_revisions set index_ready=true where id=r.id and organization_id=r.organization_id;
  else
   update public.knowledge_revisions set status=case when operation='reject' then 'rejected'::public.revision_state else 'draft'::public.revision_state end where id=r.id and organization_id=r.organization_id;
  end if;
  insert into public.reviews(organization_id,revision_id,reviewer_id,decision,comment,content_hash)
   values(r.organization_id,r.id,auth.uid(),operation,comment,hash);
  insert into public.review_requests values(r.organization_id,auth.uid(),request_key,r.id,operation,expected_hash,comment);
 end if;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(r.organization_id,auth.uid(),operation,'knowledge_revision',r.id,jsonb_build_object('content_hash',hash));
 return r.id;
end $$;
revoke all on function public.alvis_transition(uuid,text,jsonb,text,text,text) from public;
grant execute on function public.alvis_transition(uuid,text,jsonb,text,text,text) to authenticated;

create function public.alvis_copy_draft(unit uuid) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare u public.knowledge_units; r public.knowledge_revisions; draft_id uuid; next_version integer;
begin
 select * into u from public.knowledge_units where id=unit and public.alvis_role(organization_id)='expert' for update;
 if not found then raise exception 'ALVIS: Record unavailable'; end if;
 if exists(select 1 from public.knowledge_revisions where unit_id=u.id and status in ('draft','pending')) then raise exception 'ALVIS: Finish the existing draft before creating a new version'; end if;
 select * into r from public.knowledge_revisions where unit_id=u.id and organization_id=u.organization_id order by version desc limit 1;
 if not found then raise exception 'ALVIS: No source revision available'; end if;
 select coalesce(max(version),0)+1 into next_version from public.knowledge_revisions where unit_id=u.id;
 insert into public.knowledge_revisions(organization_id,unit_id,version,content,created_by) values(u.organization_id,u.id,next_version,r.content,auth.uid()) returning id into draft_id;
 insert into public.revision_sources select organization_id,draft_id,source_id from public.revision_sources where revision_id=r.id and organization_id=u.organization_id;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id) values(u.organization_id,auth.uid(),'create_revision','knowledge_revision',draft_id);
 return draft_id;
end $$;
revoke all on function public.alvis_copy_draft(uuid) from public;
grant execute on function public.alvis_copy_draft(uuid) to authenticated;

-- Hash is calculated on the database's canonical JSON representation.
alter table public.knowledge_revisions add column content_hash text generated always as (public.alvis_content_hash(content)) stored;

-- Workers can see the approving reviewer's name without exposing the membership directory.
create function public.alvis_review_summaries(org uuid)
 returns table(revision_id uuid,reviewer_name text,approved_at timestamptz)
 language sql stable security definer set search_path=public,pg_catalog as $$
 select v.revision_id,m.display_name,v.created_at from public.reviews v
 join public.memberships m on m.organization_id=v.organization_id and m.user_id=v.reviewer_id
 join public.knowledge_revisions r on r.organization_id=v.organization_id and r.id=v.revision_id
 join public.knowledge_units u on u.organization_id=r.organization_id and u.id=r.unit_id and u.active_revision_id=r.id
 where v.organization_id=org and public.alvis_role(org) is not null
 and v.decision='approve' and r.status='approved' and r.index_ready
 order by v.created_at desc
$$;
revoke all on function public.alvis_review_summaries(uuid) from public;
grant execute on function public.alvis_review_summaries(uuid) to authenticated;

-- Seed/provisioning authority is server-only; application clients use authenticated RPCs.
grant all on all tables in schema public to service_role;
