set search_path=public,extensions,pg_catalog;
create function public.alvis_public_library(query_text text default '',topic_filter text default '',equipment_filter text default '',contributor uuid default null,publication uuid default null) returns jsonb
language sql stable security definer set search_path=public,pg_catalog as $$
 select coalesce(jsonb_agg(row_to_json(x)), '[]') from (
 select p.id,p.revision_id,p.author_id,cp.display_name contributor,p.topic,p.equipment,p.content,p.excerpts,p.reviewed_by,p.reviewed_at,r.version,
 'Community reviewed'::text review_label
 from community_publications p join community_profiles cp on cp.user_id=p.author_id join knowledge_revisions r on r.id=p.revision_id
 where alvis_community_visible(p.id) and (publication is null or p.id=publication)
 and (contributor is null or p.author_id=contributor)
 and (topic_filter='' or p.topic ilike '%'||left(topic_filter,100)||'%')
 and (equipment_filter='' or p.equipment ilike '%'||left(equipment_filter,100)||'%')
 and (query_text='' or to_tsvector('english',p.content::text||' '||p.topic||' '||p.equipment) @@ websearch_to_tsquery('english',left(query_text,1000)))
 order by p.reviewed_at desc,p.id limit 50) x
$$;
create function public.alvis_public_search(query_text text,query_vector vector(1536),model text,equipment_filter text default '')
returns table(revision_id uuid,unit_id uuid,code text,content jsonb,score double precision)
language sql stable security definer set search_path=public,extensions,pg_catalog as $$
 with allowed as materialized (
 select c.*,r.unit_id,p.content,p.id::text code from community_publications p
 join knowledge_revisions r on r.id=p.revision_id and r.organization_id=p.scope_id
 join knowledge_chunks c on c.revision_id=r.id and c.organization_id=p.scope_id
 where alvis_community_visible(p.id) and c.embedding_model=model
 and (equipment_filter='' or p.equipment ilike '%'||left(equipment_filter,100)||'%')
 ), keyword as (select id,row_number() over(order by ts_rank_cd(search_terms,websearch_to_tsquery('english',query_text)) desc,id) rank from allowed where search_terms @@ websearch_to_tsquery('english',query_text) limit 30),
 semantic as (select id,row_number() over(order by embedding <=> query_vector,id) rank from allowed order by embedding <=> query_vector,id limit 30),
 fused as (select a.revision_id,a.unit_id,a.code,a.content,max(coalesce(1.0/(60+k.rank),0)+coalesce(1.0/(60+s.rank),0))::double precision score from allowed a left join keyword k using(id) left join semantic s using(id) where k.id is not null or s.id is not null group by a.revision_id,a.unit_id,a.code,a.content)
 select * from fused order by score desc,revision_id limit 5
$$;

create function public.alvis_community_record_answer(question text,response jsonb,revisions uuid[]) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare result uuid; revision uuid; claim jsonb; evidence text; p community_publications;
begin
 perform alvis_verified_email();
 if not exists(select 1 from community_profiles where user_id=auth.uid()) then raise exception 'ALVIS: Personal profile required'; end if;
 if length(question) not between 3 and 1000 or jsonb_typeof(response)<>'object' then raise exception 'ALVIS: Invalid question'; end if;
 if (select count(*) from community_answers where user_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'ALVIS: Question rate limit'; end if;
 foreach revision in array revisions loop
 if not exists(select 1 from community_publications p where p.revision_id=revision and alvis_community_visible(p.id)) then raise exception 'ALVIS: Public context changed'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(response->'claims') c where not ((c->>'revision_id')::uuid=any(revisions))) then raise exception 'ALVIS: Invalid citation'; end if;
 for claim in select value from jsonb_array_elements(response->'claims') loop
 select * into p from community_publications where revision_id=(claim->>'revision_id')::uuid and alvis_community_visible(id) for update;
 if not found or jsonb_typeof(claim->'evidence_ids') is distinct from 'array' or jsonb_array_length(claim->'evidence_ids')=0 then raise exception 'ALVIS: Invalid citation'; end if;
 for evidence in select jsonb_array_elements_text(claim->'evidence_ids') loop
 if not exists(select 1 from jsonb_array_elements(p.excerpts) x where x->>'id'=evidence) then raise exception 'ALVIS: Invalid evidence citation'; end if;
 end loop;
 end loop;
 insert into community_answers(user_id,query,answer,revision_ids) values(auth.uid(),question,response,revisions) returning id into result;
 return result;
end $$;

create function public.alvis_community_learning(operation text,entity uuid,body jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare p community_publications; g community_guides; l community_lessons; a community_attempts; result uuid; stripped jsonb; q jsonb; score integer:=0; choice integer;
begin
 perform alvis_verified_email();
 if not exists(select 1 from community_profiles where user_id=auth.uid()) then raise exception 'ALVIS: Personal profile required'; end if;
 if operation='history' then
 return coalesce((select jsonb_agg(jsonb_build_object('id',a0.id,'title',l0.content->>'title','revision_id',p0.revision_id,'date',a0.completed_at,'correct_count',a0.correct_count)) from community_attempts a0 join community_lessons l0 on l0.id=a0.lesson_id join community_publications p0 on p0.id=l0.publication_id where a0.user_id=auth.uid()),'[]');
 elsif operation='lessons' then
 return coalesce((select jsonb_agg(jsonb_build_object('id',l0.id,'title',l0.content->>'title','publication_id',l0.publication_id)) from community_lessons l0 where l0.state='approved' and alvis_community_visible(l0.publication_id)),'[]');
 elsif operation='lesson_queue' then
 if not exists(select 1 from community_profiles where user_id=auth.uid() and role='reviewer') then raise exception 'ALVIS: Reviewer required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(l0)) from community_lessons l0 where l0.state='draft' and l0.authored_by<>auth.uid() and alvis_community_visible(l0.publication_id)),'[]');
 end if;
 if operation in ('guide_start','lesson_generate') then
 select * into p from community_publications where id=entity for update;
 if not found or not alvis_community_visible(p.id) then raise exception 'ALVIS: Publication inactive'; end if;
 if operation='lesson_generate' then
 if p.author_id<>auth.uid() and not exists(select 1 from community_profiles where user_id=auth.uid() and role='reviewer') then raise exception 'ALVIS: Author or reviewer required'; end if;
 insert into processing_jobs(organization_id,revision_id,stage,dedupe_key,payload) values(p.scope_id,p.revision_id,'lesson',p.revision_id::text||':community-lesson:v1',jsonb_build_object('author_id',p.author_id,'content_hash',p.content_hash,'community_publication',p.id))
 on conflict(organization_id,dedupe_key) do update set status=case when processing_jobs.status='failed' and processing_jobs.attempts<3 then 'queued'::job_state else processing_jobs.status end returning id into result;
 return jsonb_build_object('job_id',result);
 end if;
 if body->>'simulation_ack' is distinct from 'true' or body->>'prerequisites_ack' is distinct from 'true' then raise exception 'ALVIS: Training and prerequisites acknowledgement required'; end if;
 insert into community_guides(user_id,publication_id,request_id) values(auth.uid(),p.id,(body->>'request_id')::uuid) on conflict(user_id,request_id) do nothing;
 select * into g from community_guides where user_id=auth.uid() and request_id=(body->>'request_id')::uuid;
 if g.publication_id<>p.id then raise exception 'ALVIS: Request key conflict'; end if;
 return to_jsonb(g)||jsonb_build_object('content',p.content);
 elsif operation in ('guide_get','guide_advance') then
 select * into g from community_guides where id=entity and user_id=auth.uid();
 if not found then raise exception 'ALVIS: Unavailable'; end if;
 select * into p from community_publications where id=g.publication_id for update;
 select * into g from community_guides where id=entity for update;
 if not alvis_community_visible(p.id) then update community_guides set state='invalidated',finished_at=coalesce(finished_at,now()) where id=g.id; return jsonb_build_object('id',g.id,'state','invalidated'); end if;
 if operation='guide_advance' then
 if g.state<>'active' or (body->>'expected_position')::integer is distinct from g.position then raise exception 'ALVIS: Refresh guide progress'; end if;
 if body->>'action'='stop' then update community_guides set state='stopped',outcome='stopped_for_help',finished_at=now() where id=g.id;
 elsif body->>'action'='next' and g.position<jsonb_array_length(p.content->'steps') then update community_guides set position=position+1 where id=g.id;
 elsif body->>'action'='finish' and g.position=jsonb_array_length(p.content->'steps') and body->>'outcome' in ('completed_in_simulation','not_resolved','stopped_for_help') then update community_guides set state=case when body->>'outcome'='stopped_for_help' then 'stopped' else 'completed' end,outcome=body->>'outcome',finished_at=now() where id=g.id;
 else raise exception 'ALVIS: Invalid guide transition'; end if;
 select * into g from community_guides where id=entity;
 end if;
 return to_jsonb(g)||jsonb_build_object('content',p.content);
 elsif operation in ('lesson_get','lesson_review','attempt') then
 select * into l from community_lessons where id=entity;
 if not found then raise exception 'ALVIS: Unavailable'; end if;
 select * into p from community_publications where id=l.publication_id for update;
 select * into l from community_lessons where id=entity for update;
 if not alvis_community_visible(p.id) then raise exception 'ALVIS: Publication inactive'; end if;
 if operation='lesson_review' then
 if not exists(select 1 from community_profiles where user_id=auth.uid() and role='reviewer') or l.authored_by=auth.uid() or l.state<>'draft' or body->>'expected_hash' is distinct from l.content_hash or coalesce(length(trim(body->>'reason')),0) not between 1 and 2000 or body->>'decision' not in ('approve','reject') then raise exception 'ALVIS: Invalid lesson review'; end if;
 update community_lessons set state=case when body->>'decision'='approve' then 'approved' else 'rejected' end,approved_by=case when body->>'decision'='approve' then auth.uid() else null end,approved_at=case when body->>'decision'='approve' then now() else null end,reason=body->>'reason' where id=l.id;
 return jsonb_build_object('reviewed',true);
 end if;
 if l.state<>'approved' then raise exception 'ALVIS: Lesson not reviewed'; end if;
 if operation='lesson_get' then
 select jsonb_agg(value-'correct_index'-'explanation') into stripped from jsonb_array_elements(l.content->'questions');
 return jsonb_build_object('id',l.id,'content',(l.content-'questions')||jsonb_build_object('questions',stripped));
 end if;
 select * into a from community_attempts where user_id=auth.uid() and submission_key=(body->>'submission_key')::uuid;
 if found then
 if a.lesson_id<>l.id or a.responses is distinct from body->'responses' then raise exception 'ALVIS: Attempt key conflict'; end if;
 return to_jsonb(a)||jsonb_build_object('questions',l.content->'questions');
 end if;
 if jsonb_typeof(body->'responses') is distinct from 'object' or (select count(*) from jsonb_object_keys(body->'responses'))<>3 then raise exception 'ALVIS: Three answers required'; end if;
 for q in select value from jsonb_array_elements(l.content->'questions') loop
 if jsonb_typeof(body->'responses'->(q->>'id')) is distinct from 'number' or (body->'responses'->>(q->>'id')) !~ '^[0-3]$' then raise exception 'ALVIS: Invalid choice'; end if;
 choice:=(body->'responses'->>(q->>'id'))::integer;
 if choice=(q->>'correct_index')::integer then score:=score+1; end if;
 end loop;
 insert into community_attempts(user_id,lesson_id,submission_key,responses,correct_count) values(auth.uid(),l.id,(body->>'submission_key')::uuid,body->'responses',score) returning * into a;
 return to_jsonb(a)||jsonb_build_object('questions',l.content->'questions');
 end if;
 raise exception 'ALVIS: Invalid operation';
end $$;

-- Existing durable lesson worker and validators are reused. A separate public
-- lesson still needs explicit reviewer approval; generated keys remain private.
alter function public.alvis_finish_lesson(uuid,uuid,jsonb) rename to alvis_private_finish_lesson;
revoke all on function public.alvis_private_finish_lesson(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.alvis_finish_lesson(job uuid,token uuid,content jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare result uuid; p community_publications; j processing_jobs;
begin
 result:=alvis_private_finish_lesson(job,token,content);
 if result is null then return null; end if;
 select * into j from processing_jobs where id=job;
 if j.payload ? 'community_publication' then
 select * into p from community_publications where id=(j.payload->>'community_publication')::uuid;
 if not found or not alvis_community_visible(p.id) or p.revision_id<>j.revision_id or p.content_hash is distinct from j.payload->>'content_hash' then raise exception 'ALVIS: Public lesson context changed'; end if;
 insert into community_lessons(id,publication_id,content,authored_by,content_hash) values(result,p.id,content,p.author_id,alvis_content_hash(content)) on conflict(id) do nothing;
 end if;
 return result;
end $$;

revoke all on function public.alvis_public_library(text,text,text,uuid,uuid),public.alvis_public_search(text,vector,text,text),public.alvis_community_record_answer(text,jsonb,uuid[]),public.alvis_community_learning(text,uuid,jsonb),public.alvis_finish_lesson(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.alvis_public_library(text,text,text,uuid,uuid) to anon,authenticated;
grant execute on function public.alvis_public_search(text,vector,text,text),public.alvis_community_record_answer(text,jsonb,uuid[]),public.alvis_community_learning(text,uuid,jsonb) to authenticated;
grant execute on function public.alvis_finish_lesson(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
