
-- Week 3: approved-only indexing and reviewed learning. Requires pgvector.
create extension if not exists vector with schema public;
set search_path=public,extensions,pg_catalog;
create table knowledge_chunks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, revision_id uuid not null,
 ordinal integer not null, text_content text not null, evidence_ids uuid[] not null, embedding vector(1536) not null,
 embedding_model text not null,
 search_terms tsvector generated always as (to_tsvector('english',text_content)) stored,
 foreign key(organization_id,revision_id) references knowledge_revisions(organization_id,id),
 unique(revision_id,ordinal)
);
create index chunks_keyword on knowledge_chunks using gin(search_terms);
alter table knowledge_chunks enable row level security;
create function alvis_is_active(org uuid,rev uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_catalog as $$
 select exists(select 1 from knowledge_revisions r join knowledge_units u on u.organization_id=r.organization_id and u.id=r.unit_id
 where r.organization_id=org and (alvis_role(org) is not null or current_setting('role',true)='service_role') and r.id=rev and r.status='approved' and r.index_ready and u.active_revision_id=r.id)
$$;
revoke all on function alvis_is_active(uuid,uuid) from public;
grant execute on function alvis_is_active(uuid,uuid) to authenticated,service_role;
create policy chunk_read on knowledge_chunks for select to authenticated using(alvis_role(organization_id) is not null and alvis_is_active(organization_id,revision_id));
grant select on knowledge_chunks to authenticated;
grant all on knowledge_chunks to service_role;

-- Replace immediate keyword readiness with an atomic queueing contract.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.alvis_transition(uuid,text,jsonb,text,text,text)'::regprocedure);
 definition:=replace(definition,'update public.knowledge_revisions set index_ready=true where id=r.id and organization_id=r.organization_id;',
 'update public.knowledge_revisions set index_ready=false where id=r.id and organization_id=r.organization_id;
 insert into public.processing_jobs(organization_id,revision_id,stage,dedupe_key,payload)
 values(r.organization_id,r.id,''index'',r.id::text||'':index:v1'',jsonb_build_object(''content_hash'',hash))
 on conflict(organization_id,dedupe_key) do nothing;');
 execute definition;
end $$;
-- Existing approved fixtures must be embedded too; do not fabricate vectors.
update knowledge_revisions set index_ready=false where status='approved';
insert into processing_jobs(organization_id,revision_id,stage,dedupe_key,payload)
select organization_id,id,'index',id::text||':index:v1',jsonb_build_object('content_hash',content_hash) from knowledge_revisions where status='approved'
on conflict(organization_id,dedupe_key) do nothing;

create function alvis_invalidate_learning() returns trigger language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
begin
 if new.status='retired' then
  update guide_sessions set state='invalidated',finished_at=now() where revision_id=new.id and organization_id=new.organization_id and state='active';
  update processing_jobs set status='cancelled',lease_token=null,lease_until=null where revision_id=new.id and organization_id=new.organization_id and stage in ('index','lesson') and status in ('queued','running');
  delete from knowledge_chunks where revision_id=new.id and organization_id=new.organization_id;
 end if; return new;
end $$;
create trigger retire_learning after update of status on knowledge_revisions for each row execute function alvis_invalidate_learning();
revoke all on function alvis_invalidate_learning() from public;

create function alvis_claim_learning_job() returns setof processing_jobs language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare j processing_jobs; begin
 update processing_jobs set status='failed',error_code='WORKER_INTERRUPTED',lease_token=null where stage in ('index','lesson') and status='running' and lease_until<now() and attempts>=3;
 select * into j from processing_jobs where stage in ('index','lesson') and attempts<3 and
 ((status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
 if not found then return; end if;
 update processing_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),error_code=null where id=j.id returning * into j;
 return next j;
end $$;
create function alvis_vector_dimensions() returns integer language sql stable as $$
 select substring(format_type(a.atttypid,a.atttypmod) from '\(([0-9]+)\)')::integer from pg_attribute a where a.attrelid='public.knowledge_chunks'::regclass and a.attname='embedding'
$$;
create function alvis_finish_index(job uuid,token uuid,chunks jsonb,model text) returns boolean language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare j processing_jobs; r knowledge_revisions; u knowledge_units; c jsonb; n integer:=0; begin
 select * into j from processing_jobs where id=job and stage='index';
 if not found then raise exception 'ALVIS: Unavailable job'; end if;
 select * into r from knowledge_revisions where id=j.revision_id and organization_id=j.organization_id;
 select * into u from knowledge_units where id=r.unit_id and organization_id=r.organization_id for update;
 select * into j from processing_jobs where id=job and lease_token=token and status='running' and lease_until>now() for update;
 if not found then raise exception 'ALVIS: Lease lost'; end if;
 if r.status<>'approved' or u.active_revision_id<>r.id then
 update processing_jobs set status='cancelled',lease_token=null where id=j.id; return false; end if;
 if j.payload->>'content_hash' is distinct from r.content_hash or jsonb_typeof(chunks)<>'array' or jsonb_array_length(chunks) not between 1 and 100 or length(model)=0 then raise exception 'ALVIS: Invalid index'; end if;
 delete from knowledge_chunks where revision_id=r.id and organization_id=r.organization_id;
 for c in select value from jsonb_array_elements(chunks) loop
  if (c->>'ordinal')::integer<>n or length(c->>'text') not between 1 and 6000 or jsonb_array_length(c->'embedding')<>1536 then raise exception 'ALVIS: Invalid chunk'; end if;
  if exists(select 1 from jsonb_array_elements_text(c->'evidence_ids') e where not exists(
   select 1 from revision_sources rs where rs.organization_id=r.organization_id and rs.revision_id=r.id and rs.source_id::text=e
   and r.content @? ('$.**.evidence_ids[*] ? (@ == "'||e||'")')::jsonpath)) then raise exception 'ALVIS: Invalid evidence'; end if;
  insert into knowledge_chunks(organization_id,revision_id,ordinal,text_content,evidence_ids,embedding,embedding_model)
  values(r.organization_id,r.id,n,c->>'text',array(select value::uuid from jsonb_array_elements_text(c->'evidence_ids')),(c->'embedding')::text::vector,model);
  n:=n+1;
 end loop;
 update knowledge_revisions set index_ready=true where id=r.id;
 update processing_jobs set status='succeeded',completed_at=now(),lease_token=null,lease_until=null where id=j.id; return true;
end $$;

create function alvis_hybrid_search(org uuid,asset uuid,query_text text,query_vector vector(1536),model text)
returns table(revision_id uuid,unit_id uuid,code text,content jsonb,score double precision) language sql stable security definer set search_path=public,extensions,pg_catalog as $$
 with allowed as materialized (
 select c.*,r.unit_id,r.content,u.code from knowledge_chunks c
 join knowledge_revisions r on r.organization_id=c.organization_id and r.id=c.revision_id
 join knowledge_units u on u.organization_id=r.organization_id and u.id=r.unit_id and u.active_revision_id=r.id
 where c.organization_id=org and alvis_role(org) is not null and u.asset_id=asset and r.status='approved' and r.index_ready and c.embedding_model=model
 ), keyword as (select id,row_number() over(order by ts_rank_cd(search_terms,websearch_to_tsquery('english',query_text)) desc,id) rank from allowed where search_terms @@ websearch_to_tsquery('english',query_text) limit 30),
 semantic as (select id,row_number() over(order by embedding <=> query_vector,id) rank from allowed order by embedding <=> query_vector,id limit 30),
 fused as (select a.revision_id,a.unit_id,a.code,a.content,max(coalesce(1.0/(60+k.rank),0)+coalesce(1.0/(60+s.rank),0))::double precision score from allowed a left join keyword k using(id) left join semantic s using(id) where k.id is not null or s.id is not null group by a.revision_id,a.unit_id,a.code,a.content)
 select * from fused order by score desc,revision_id limit 5
$$;

alter table lessons add column state text not null default 'draft' check(state in ('draft','approved','rejected'));
alter table lessons add column content_hash text generated always as (alvis_content_hash(content)) stored;
alter table lessons add column author_id uuid;
alter table lessons add constraint lesson_author foreign key(organization_id,author_id) references memberships(organization_id,user_id);
alter table guide_sessions add column simulation_ack_at timestamptz;
alter table guide_sessions add column prerequisites_ack_at timestamptz;
alter table assessment_attempts add column submission_key uuid;
create unique index assessment_dedupe on assessment_attempts(worker_id,submission_key);
create table expert_review_tasks(id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id),requester_id uuid not null,ask_id uuid not null,
 created_at timestamptz not null default now(),unique(ask_id),foreign key(organization_id,requester_id) references memberships(organization_id,user_id),foreign key(organization_id,ask_id) references ask_sessions(organization_id,id));
alter table expert_review_tasks enable row level security;
create policy task_read on expert_review_tasks for select to authenticated using(alvis_role(organization_id) in ('reviewer','admin') or (requester_id=auth.uid() and alvis_role(organization_id) is not null));
grant select on expert_review_tasks to authenticated; grant all on expert_review_tasks to service_role;

create function alvis_learning_command(org uuid,operation text,entity uuid,body jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare role member_role; j processing_jobs; r knowledge_revisions; g guide_sessions; l lessons; a assessment_attempts; q jsonb; stripped jsonb; count_correct integer:=0; result_id uuid; question_id text; choice integer; u knowledge_units; begin
 role:=alvis_role(org);
 if role is null then raise exception 'ALVIS: Unavailable'; end if;
 if operation in ('guide_start','lesson_generate','retire') then
  select * into r from knowledge_revisions where id=entity and organization_id=org;
  if not found then raise exception 'ALVIS: Unavailable'; end if;
  select * into u from knowledge_units where id=r.unit_id and organization_id=org for update;
  if r.status<>'approved' or u.active_revision_id is distinct from r.id or (operation<>'retire' and not r.index_ready) then raise exception 'ALVIS: Revision no longer active'; end if;
  if operation='retire' then
   if role<>'reviewer' or coalesce(length(trim(body->>'comment')),0)<1 then raise exception 'ALVIS: Reviewer comment required'; end if;
   update knowledge_revisions set status='retired',index_ready=false where id=r.id;
   update knowledge_units set active_revision_id=null where id=u.id;
   insert into audit_events(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org,auth.uid(),'retire','knowledge_revision',r.id,jsonb_build_object('comment',body->>'comment','content_hash',r.content_hash));
   insert into reviews(organization_id,revision_id,reviewer_id,decision,comment,content_hash) values(org,r.id,auth.uid(),'retire',body->>'comment',r.content_hash);
   return jsonb_build_object('retired',true);
  elsif operation='lesson_generate' then
   if role<>'reviewer' then raise exception 'ALVIS: Reviewer required'; end if;
   insert into processing_jobs(organization_id,revision_id,stage,dedupe_key,payload) values(org,r.id,'lesson',r.id::text||':lesson:v'||(1+(select count(*) from lessons where organization_id=org and revision_id=r.id and state='rejected'))::text,jsonb_build_object('author_id',auth.uid(),'content_hash',r.content_hash))
   on conflict(organization_id,dedupe_key) do update set status=case when processing_jobs.status='failed' and processing_jobs.attempts<3 then 'queued'::job_state else processing_jobs.status end returning id into result_id;
   return jsonb_build_object('job_id',result_id);
  else
   if body->>'simulation_ack'<>'true' or body->>'prerequisites_ack'<>'true' or coalesce(body->>'simulation_ack','')='' or coalesce(body->>'prerequisites_ack','')='' then raise exception 'ALVIS: Acknowledgements required'; end if;
   insert into guide_sessions(organization_id,worker_id,revision_id,state,simulation_ack_at,prerequisites_ack_at) values(org,auth.uid(),r.id,'active',now(),now()) returning id into result_id;
   return jsonb_build_object('id',result_id);
  end if;
 elsif operation in ('guide_get','guide_advance') then
  select * into g from guide_sessions where id=entity and organization_id=org and worker_id=auth.uid();
  if not found then raise exception 'ALVIS: Unavailable'; end if;
  select * into r from knowledge_revisions where id=g.revision_id and organization_id=org;
  select * into u from knowledge_units where id=r.unit_id and organization_id=org for update;
  select * into g from guide_sessions where id=entity for update;
  if not alvis_is_active(org,r.id) then update guide_sessions set state='invalidated',finished_at=coalesce(finished_at,now()) where id=g.id; return jsonb_build_object('id',g.id,'state','invalidated'); end if;
  if operation='guide_advance' then
   if g.state<>'active' or (body->>'expected_position')::integer is distinct from g.step_position then raise exception 'ALVIS: Refresh guide progress'; end if;
   if body->>'action'='stop' then update guide_sessions set state='stopped',outcome='stopped_for_help',finished_at=now() where id=g.id;
   elsif body->>'action'='back' then update guide_sessions set step_position=greatest(0,step_position-1) where id=g.id;
   elsif body->>'action'='next' and g.step_position<jsonb_array_length(r.content->'steps') then update guide_sessions set step_position=step_position+1 where id=g.id;
   elsif body->>'action'='finish' and g.step_position=jsonb_array_length(r.content->'steps') and body->>'outcome' in ('completed_in_simulation','not_resolved','stopped_for_help') then update guide_sessions set state=case when body->>'outcome'='stopped_for_help' then 'stopped' else 'completed' end,outcome=body->>'outcome',finished_at=now() where id=g.id;
   else raise exception 'ALVIS: Invalid guide transition'; end if;
   select * into g from guide_sessions where id=entity;
  end if;
  return to_jsonb(g)||jsonb_build_object('content',r.content,'version',r.version);
 elsif operation in ('lesson_get','lesson_review','attempt') then
  select * into l from lessons where id=entity and organization_id=org;
  if not found then raise exception 'ALVIS: Unavailable'; end if;
  select * into r from knowledge_revisions where id=l.revision_id and organization_id=org;
  select * into u from knowledge_units where id=r.unit_id and organization_id=org for update;
  select * into l from lessons where id=entity for update;
  if not alvis_is_active(org,l.revision_id) then raise exception 'ALVIS: Revision no longer active'; end if;
  if operation='lesson_review' then
   if role<>'reviewer' or l.state<>'draft' or body->>'expected_hash' is distinct from l.content_hash or coalesce(length(trim(body->>'comment')),0)<1 or body->>'decision' not in ('approve','reject') then raise exception 'ALVIS: Invalid lesson review'; end if;
   update lessons set state=case when body->>'decision'='approve' then 'approved' else 'rejected' end,approved_by=case when body->>'decision'='approve' then auth.uid() else null end,approved_at=case when body->>'decision'='approve' then now() else null end where id=l.id;
   insert into audit_events(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org,auth.uid(),body->>'decision','lesson',l.id,jsonb_build_object('comment',body->>'comment','content_hash',l.content_hash));
   return jsonb_build_object('reviewed',true);
  end if;
  if l.state<>'approved' or l.approved_at is null then raise exception 'ALVIS: Lesson not reviewed'; end if;
  if operation='lesson_get' then
   select jsonb_agg(value-'correct_index'-'explanation') into stripped from jsonb_array_elements(l.content->'questions');
   return jsonb_build_object('id',l.id,'version',r.version,'content',(l.content-'questions')||jsonb_build_object('questions',stripped));
  end if;
  select * into a from assessment_attempts where worker_id=auth.uid() and submission_key=(body->>'submission_key')::uuid;
  if found then
   if a.lesson_id<>l.id or a.responses is distinct from body->'responses' then raise exception 'ALVIS: Attempt key conflict'; end if;
   return to_jsonb(a)||jsonb_build_object('questions',l.content->'questions');
  end if;
  if jsonb_typeof(body->'responses')<>'object' or (select count(*) from jsonb_object_keys(body->'responses'))<>3 or body->>'submission_key' is null then raise exception 'ALVIS: Three answers required'; end if;
  for q in select value from jsonb_array_elements(l.content->'questions') loop
   question_id:=q->>'id';
   if jsonb_typeof(body->'responses'->question_id)<>'number' or (body->'responses'->>question_id)!~'^[0-3]$' or body->'responses'->question_id is null then raise exception 'ALVIS: Invalid answer'; end if;
   choice:=(body->'responses'->>question_id)::integer;
   if choice=(q->>'correct_index')::integer then count_correct:=count_correct+1; end if;
  end loop;
  insert into assessment_attempts(organization_id,worker_id,lesson_id,responses,correct_count,submission_key) values(org,auth.uid(),l.id,body->'responses',count_correct,(body->>'submission_key')::uuid) returning * into a;
  return to_jsonb(a)||jsonb_build_object('questions',l.content->'questions');
 elsif operation='retry_learning' then
  select * into j from processing_jobs where id=entity and organization_id=org and stage in ('index','lesson') for update;
  if role<>'reviewer' or not found or j.status<>'failed' or j.attempts>=3 then raise exception 'ALVIS: Retry unavailable'; end if;
  update processing_jobs set status='queued',next_attempt_at=now(),error_code=null where id=j.id;
  return jsonb_build_object('queued',true);
 elsif operation='request_review' then
  if not exists(select 1 from ask_sessions where id=entity and organization_id=org and worker_id=auth.uid() and response->>'mode'='abstain') then raise exception 'ALVIS: Unavailable'; end if;
  insert into expert_review_tasks(organization_id,requester_id,ask_id) values(org,auth.uid(),entity) on conflict(ask_id) do nothing;
  return jsonb_build_object('requested',true);
 else raise exception 'ALVIS: Unsupported operation'; end if;
end $$;

create function alvis_reserve_ask(org uuid,asset uuid,question text) returns uuid language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare result uuid; begin
 if alvis_role(org) is null or length(trim(question)) not between 3 and 1000 then raise exception 'ALVIS: Invalid question'; end if;
 if asset is not null and not exists(select 1 from assets where id=asset and organization_id=org) then raise exception 'ALVIS: Asset unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from ask_sessions where organization_id=org and worker_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'ALVIS: Ask rate limit'; end if;
 insert into ask_sessions(organization_id,worker_id,asset_id,query) values(org,auth.uid(),asset,question) returning id into result; return result;
end $$;
create function alvis_record_answer(session uuid,answer jsonb,ids uuid[]) returns void language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare s ask_sessions; claim jsonb; evidence text; begin
 if cardinality(ids)>5 then raise exception 'ALVIS: Too many retrieved revisions'; end if;
 select * into s from ask_sessions where id=session and worker_id=auth.uid() and alvis_role(organization_id) is not null for update;
 if not found or s.response is not null then raise exception 'ALVIS: Unavailable'; end if;
 -- Lock the asset's units against concurrent replacement before final citation checks.
 perform 1 from knowledge_units where organization_id=s.organization_id and asset_id=s.asset_id order by id for share;
 if exists(select 1 from unnest(ids) as cited(rev) where not alvis_is_active(s.organization_id,cited.rev) or not exists(select 1 from knowledge_revisions r join knowledge_units u on u.id=r.unit_id and u.organization_id=r.organization_id where r.id=cited.rev and u.asset_id=s.asset_id and r.organization_id=s.organization_id)) then raise exception 'ALVIS: Retrieved revision changed'; end if;
 for claim in select value from jsonb_array_elements(answer->'claims') loop
  if not (claim->>'revision_id')::uuid=any(ids) then raise exception 'ALVIS: Invalid citation'; end if;
  for evidence in select value from jsonb_array_elements_text(claim->'evidence_ids') loop
   if not exists(select 1 from revision_sources rs join knowledge_revisions r on r.id=rs.revision_id and r.organization_id=rs.organization_id
    where rs.organization_id=s.organization_id and rs.revision_id=(claim->>'revision_id')::uuid and rs.source_id::text=evidence and exists(select 1 from jsonb_path_query(r.content,'$.**.evidence_ids[*]') e where e#>>'{}'=evidence)) then raise exception 'ALVIS: Invalid evidence'; end if;
  end loop;
 end loop;
 update ask_sessions set response=answer,retrieved_revision_ids=ids where id=s.id;
end $$;

create function alvis_finish_lesson(job uuid,token uuid,content jsonb) returns uuid language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare j processing_jobs; r knowledge_revisions; u knowledge_units; q jsonb; e text; result uuid; begin
 select * into j from processing_jobs where id=job and stage='lesson';
 if not found then raise exception 'ALVIS: Unavailable'; end if;
 select * into r from knowledge_revisions where id=j.revision_id and organization_id=j.organization_id;
 select * into u from knowledge_units where id=r.unit_id and organization_id=r.organization_id for update;
 select * into j from processing_jobs where id=job and lease_token=token and status='running' and lease_until>now() for update;
 if not found then raise exception 'ALVIS: Lease lost'; end if;
 if not alvis_is_active(r.organization_id,r.id) then update processing_jobs set status='cancelled',lease_token=null where id=j.id; return null; end if;
 if content->>'revision_id' is distinct from r.id::text or jsonb_array_length(content->'questions')<>3 or coalesce(array_length(regexp_split_to_array(trim(content->>'explanation'),'\s+'),1),0) not between 130 and 195 or coalesce(length(trim(content->>'title')),0)=0 or jsonb_array_length(content->'evidence_ids')<1 or (select count(distinct value->>'id') from jsonb_array_elements(content->'questions'))<>3 then raise exception 'ALVIS: Invalid lesson'; end if;
 for q in select value from jsonb_array_elements(content->'questions') loop
  if jsonb_array_length(q->'options')<>4 or (select count(distinct value) from jsonb_array_elements_text(q->'options'))<>4 or coalesce(q->>'correct_index','') !~ '^[0-3]$' or jsonb_array_length(q->'evidence_ids')<1 or coalesce(length(trim(q->>'prompt')),0)=0 or coalesce(length(trim(q->>'id')),0)=0 or coalesce(length(trim(q->>'explanation')),0)=0 then raise exception 'ALVIS: Invalid assessment'; end if;
 end loop;
 for e in select x#>>'{}' from jsonb_path_query(content,'$.**.evidence_ids[*]') x loop
  if not exists(select 1 from revision_sources rs where rs.organization_id=r.organization_id and rs.revision_id=r.id and rs.source_id::text=e and exists(select 1 from jsonb_path_query(r.content,'$.**.evidence_ids[*]') x where x#>>'{}'=e)) then raise exception 'ALVIS: Invalid lesson evidence'; end if;
 end loop;
 insert into lessons(organization_id,revision_id,content,author_id) values(r.organization_id,r.id,content,(j.payload->>'author_id')::uuid) returning id into result;
 update processing_jobs set status='succeeded',completed_at=now(),lease_token=null,lease_until=null where id=j.id; return result;
end $$;
create function protect_reviewed_lesson() returns trigger language plpgsql as $$ begin
 if old.state='approved' and new is distinct from old then raise exception 'Reviewed lesson is immutable'; end if; return new; end $$;
create trigger lesson_immutable before update on lessons for each row execute function protect_reviewed_lesson();

revoke all on function alvis_claim_learning_job(),alvis_vector_dimensions(),alvis_finish_index(uuid,uuid,jsonb,text),alvis_finish_lesson(uuid,uuid,jsonb),protect_reviewed_lesson() from public;
grant execute on function alvis_claim_learning_job(),alvis_finish_index(uuid,uuid,jsonb,text),alvis_finish_lesson(uuid,uuid,jsonb) to service_role;
grant execute on function alvis_vector_dimensions() to service_role,authenticated;
revoke all on function alvis_hybrid_search(uuid,uuid,text,vector,text),alvis_learning_command(uuid,text,uuid,jsonb),alvis_reserve_ask(uuid,uuid,text),alvis_record_answer(uuid,jsonb,uuid[]) from public;
grant execute on function alvis_hybrid_search(uuid,uuid,text,vector,text),alvis_learning_command(uuid,text,uuid,jsonb),alvis_reserve_ask(uuid,uuid,text),alvis_record_answer(uuid,jsonb,uuid[]) to authenticated;

create function alvis_learning_history(org uuid) returns jsonb language sql stable security definer set search_path=public,extensions,pg_catalog as $$
 select jsonb_build_object('attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'lesson_id',l.id,'title',l.content->>'title','revision_id',r.id,'version',r.version,'completed_at',a.completed_at,'correct_count',a.correct_count,'skill_tags',r.content->'skill_tags') order by a.completed_at desc) from assessment_attempts a join lessons l on l.organization_id=a.organization_id and l.id=a.lesson_id join knowledge_revisions r on r.organization_id=l.organization_id and r.id=l.revision_id where a.organization_id=org and a.worker_id=auth.uid() and alvis_role(org) is not null),'[]'::jsonb),'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.content->>'title','revision_id',r.id,'version',r.version,'skill_tags',r.content->'skill_tags')) from lessons l join knowledge_revisions r on r.organization_id=l.organization_id and r.id=l.revision_id where l.organization_id=org and alvis_role(org) is not null and l.state='approved' and l.approved_at is not null and alvis_is_active(org,l.revision_id)),'[]'::jsonb))
$$;
revoke all on function alvis_learning_history(uuid) from public;
grant execute on function alvis_learning_history(uuid) to authenticated;

-- Own history remains scoped to current membership even after account removal.
drop policy ask_read on ask_sessions;
create policy ask_read on ask_sessions for select to authenticated using(alvis_role(organization_id) is not null and (worker_id=auth.uid() or alvis_role(organization_id) in ('admin','reviewer')));
drop policy guide_read on guide_sessions;
create policy guide_read on guide_sessions for select to authenticated using(alvis_role(organization_id) is not null and (worker_id=auth.uid() or alvis_role(organization_id) in ('admin','reviewer')));
drop policy attempt_read on assessment_attempts;
create policy attempt_read on assessment_attempts for select to authenticated using(alvis_role(organization_id) is not null and (worker_id=auth.uid() or alvis_role(organization_id) in ('admin','reviewer')));
