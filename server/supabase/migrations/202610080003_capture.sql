-- Week 2: append-only evidence, private media, durable jobs. No AI publication authority.
alter table captures add column task text not null default '';
alter table captures add column generation integer not null default 0;
alter table captures add column transcript_version integer not null default 0;
alter table captures add column accepted_generation integer not null default -1;
alter table captures add column current_revision_id uuid;
alter table captures add constraint capture_revision foreign key(organization_id,current_revision_id) references knowledge_revisions(organization_id,id);
alter table sources add column evidence_version integer not null default 0;
alter table sources add column supersedes uuid;
alter table sources add constraint same_tenant_supersedes foreign key(organization_id,supersedes) references sources(organization_id,id);
alter table debrief_items add column source_ids jsonb not null default '[]';
alter table debrief_items add column gap text not null default '';
alter table debrief_items add column cannot_confirm boolean not null default false;
alter table processing_jobs drop constraint processing_jobs_stage_check;
alter table processing_jobs add constraint processing_jobs_stage_check check(stage in ('media','transcribe','extract','debrief','answer','index','lesson'));
alter table processing_jobs add column payload jsonb not null default '{}';
alter table processing_jobs add column lease_token uuid;
alter table processing_jobs add column completed_at timestamptz;
alter table ai_runs add column audio_seconds numeric;
alter table ai_runs add column provider_request_id text;
alter table ai_runs add column usage jsonb;
create table capture_uploads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, capture_id uuid not null,
 question_id uuid, storage_key text not null unique, mime text not null, expected_bytes bigint not null check(expected_bytes between 1 and 104857600),
 checksum text, complete boolean not null default false, expires_at timestamptz not null default now()+interval '5 minutes',
 foreign key(organization_id,capture_id) references captures(organization_id,id),
 foreign key(organization_id,question_id) references debrief_items(organization_id,id), unique(organization_id,id)
);
create table extraction_proposals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, capture_id uuid not null,
 revision_id uuid not null, generation integer not null, base_hash text not null, content jsonb not null,
 status text not null default 'proposed' check(status in ('proposed','accepted','dismissed')),
 created_at timestamptz not null default now(),
 foreign key(organization_id,capture_id) references captures(organization_id,id),
 foreign key(organization_id,revision_id) references knowledge_revisions(organization_id,id)
);
alter table capture_uploads enable row level security;
alter table extraction_proposals enable row level security;
create policy upload_read on capture_uploads for select to authenticated using(exists(select 1 from captures c where c.id=capture_id));
create policy proposal_read on extraction_proposals for select to authenticated using(exists(select 1 from captures c where c.id=capture_id));
grant select on capture_uploads,extraction_proposals to authenticated;
grant all on capture_uploads,extraction_proposals to service_role;
revoke all on capture_uploads,extraction_proposals from anon;
create index job_due on processing_jobs(next_attempt_at) where status in ('queued','running');

create function alvis_new_capture(asset uuid, title text, task text, consent text) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare a assets; id uuid;
begin
 select * into a from assets where assets.id=asset and alvis_role(organization_id)='expert';
 if not found then raise exception 'ALVIS: Asset unavailable'; end if;
 if consent<>'recording-v1' or length(trim(title)) not between 1 and 200 or length(trim(task)) not between 1 and 2000 then raise exception 'ALVIS: Title, task and recording consent required'; end if;
 perform 1 from memberships where organization_id=a.organization_id and user_id=auth.uid() for update;
 if (select count(*) from captures where owner_id=auth.uid() and organization_id=a.organization_id and state in ('uploading','queued','processing'))>=2 then raise exception 'ALVIS: Finish an existing capture first'; end if;
 insert into captures(organization_id,asset_id,owner_id,title,task,consent_at,consent_version,state)
 values(a.organization_id,a.id,auth.uid(),title,task,now(),consent,'uploading') returning captures.id into id;
 insert into audit_events(organization_id,actor_id,action,entity_type,entity_id) values(a.organization_id,auth.uid(),'capture_consent','capture',id);
 return id;
end $$;

create function alvis_capture_command(capture uuid, operation text, body jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare c captures; r knowledge_revisions; up capture_uploads; q debrief_items; p extraction_proposals;
 x jsonb; old sources; sid uuid; jid uuid; vid uuid; gen integer; key text;
begin
 select * into c from captures where id=capture and owner_id=auth.uid() and alvis_role(organization_id)='expert' for update;
 if not found then raise exception 'ALVIS: Capture unavailable'; end if;
 select * into r from knowledge_revisions where id=c.current_revision_id and organization_id=c.organization_id;
 if operation in ('transcript','debrief','regenerate','accept','dismiss') and r.id is not null and r.status<>'draft' then raise exception 'ALVIS: Reviewed or submitted content is locked; create a new draft revision'; end if;
 if operation='upload' then
  if body->>'kind'='audio' then
   select * into q from debrief_items where id=(body->>'question_id')::uuid and capture_id=c.id and organization_id=c.organization_id;
   if not found or q.answer_source_id is not null then raise exception 'ALVIS: Question unavailable or already answered'; end if;
   if body->>'mime' not in ('audio/webm','audio/mp4') or (body->>'bytes')::bigint>10485760 then raise exception 'ALVIS: Audio must be MP4/WebM, up to 10 MB'; end if;
  else
   if c.state not in ('uploading','failed') or c.transcript_version>0 then raise exception 'ALVIS: Recording is already locked'; end if;
   if body->>'mime' not in ('video/mp4','video/webm') then raise exception 'ALVIS: Recording must be MP4 or WebM'; end if;
  end if;
  if (body->>'bytes')::bigint not between 1 and 104857600 then raise exception 'ALVIS: File exceeds 100 MB'; end if;
  if exists(select 1 from processing_jobs where capture_id=c.id and status in ('queued','running')) then raise exception 'ALVIS: Wait for processing'; end if;
  select * into up from capture_uploads where capture_id=c.id and question_id is not distinct from q.id and not complete and expected_bytes=(body->>'bytes')::bigint and mime=body->>'mime' and expires_at>now() order by expires_at desc limit 1;
  if not found then
   vid:=gen_random_uuid();
   key:=c.organization_id::text||'/'||c.id::text||'/'||vid::text||case when q.id is null then '/recording' else '/answer' end;
   insert into capture_uploads(id,organization_id,capture_id,question_id,storage_key,mime,expected_bytes)
   values(vid,c.organization_id,c.id,q.id,key,body->>'mime',(body->>'bytes')::bigint) returning * into up;
  end if;
  return to_jsonb(up);
 elsif operation='complete' then
  select * into up from capture_uploads where id=(body->>'upload_id')::uuid and capture_id=c.id and organization_id=c.organization_id for update;
  if not found then raise exception 'ALVIS: Upload unavailable'; end if;
  if length(coalesce(body->>'request_key','')) not between 8 and 200 or coalesce(body->>'checksum','') !~ '^[a-f0-9]{64}$' then raise exception 'ALVIS: Completion requires idempotency key and SHA-256'; end if;
  if up.complete then
   if up.checksum<>body->>'checksum' then raise exception 'ALVIS: Completion checksum changed'; end if;
   select id into jid from processing_jobs where dedupe_key='upload:'||up.id::text;
   return jsonb_build_object('job_id',jid);
  end if;
  if up.expires_at<now() then raise exception 'ALVIS: Upload expired; request a fresh upload'; end if;
  update capture_uploads set complete=true,checksum=body->>'checksum' where id=up.id;
  if up.question_id is null then
   update captures set state='queued',storage_key=up.storage_key where id=c.id;
  end if;
  insert into processing_jobs(organization_id,capture_id,stage,dedupe_key,payload)
  values(c.organization_id,c.id,case when up.question_id is null then 'media' else 'answer' end,'upload:'||up.id::text,jsonb_build_object('upload_id',up.id,'generation',c.generation)) returning id into jid;
  return jsonb_build_object('job_id',jid);
 elsif operation='retry' then
  if c.state<>'failed' then raise exception 'ALVIS: Only a currently failed capture can retry'; end if;
  update processing_jobs set status='queued',next_attempt_at=now(),error_code=null
  where id=(body->>'job_id')::uuid and capture_id=c.id and organization_id=c.organization_id and status='failed' and attempts<3 and error_code in ('TRANSIENT','WORKER_INTERRUPTED','PROVIDER_CONFIGURATION','STORAGE_UNAVAILABLE','DATABASE_FAILURE','USAGE_RECORD_FAILED','FFMPEG_UNAVAILABLE','MEDIA_TIMEOUT','INVALID_MODEL_OUTPUT') returning id into jid;
  if jid is null then raise exception 'ALVIS: Retry limit reached or stage needs correction'; end if;
  update captures set state='queued' where id=c.id;
  return jsonb_build_object('job_id',jid);
 elsif operation='transcript' then
  if c.transcript_version=0 or (body->>'expected_version')::integer<>c.transcript_version then raise exception 'ALVIS: Stale transcript'; end if;
  if jsonb_typeof(body->'segments') is distinct from 'array' or jsonb_array_length(body->'segments')=0 then raise exception 'ALVIS: Segment corrections required'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(body->'segments'))<>jsonb_array_length(body->'segments') then raise exception 'ALVIS: Duplicate segment corrections'; end if;
  for x in select value from jsonb_array_elements(body->'segments') loop
   if length(trim(x->>'text')) not between 1 and 10000 or not exists(select 1 from sources where id=(x->>'id')::uuid and capture_id=c.id and kind='transcript' and evidence_version=c.transcript_version) then raise exception 'ALVIS: Segment unavailable or invalid'; end if;
  end loop;
  for old in select * from sources where capture_id=c.id and kind='transcript' and evidence_version=c.transcript_version loop
   select value into x from jsonb_array_elements(body->'segments') where value->>'id'=old.id::text;
   insert into sources(organization_id,capture_id,kind,locator,text_content,start_ms,end_ms,evidence_version,supersedes)
   values(c.organization_id,c.id,'transcript',old.locator,coalesce(x->>'text',old.text_content),old.start_ms,old.end_ms,c.transcript_version+1,old.id);
  end loop;
  update captures set transcript_version=transcript_version+1,generation=generation+1 where id=c.id returning generation into gen;
  update processing_jobs set status='cancelled',lease_token=null,lease_until=null where capture_id=c.id and stage in ('extract','debrief') and status in ('queued','running') and (payload->>'generation')::integer<gen;
 elsif operation='debrief' then
  select * into q from debrief_items where id=(body->>'question_id')::uuid and capture_id=c.id and organization_id=c.organization_id for update;
  if not found then raise exception 'ALVIS: Question unavailable'; end if;
  if q.answer_source_id is not null then
   if q.answer_text is distinct from body->>'answer' or q.cannot_confirm is distinct from coalesce((body->>'cannot_confirm')::boolean,false) then raise exception 'ALVIS: Answer already saved; evidence is immutable'; end if;
   return jsonb_build_object('source_id',q.answer_source_id);
  end if;
  if not coalesce((body->>'cannot_confirm')::boolean,false) and length(trim(coalesce(body->>'answer',''))) not between 1 and 10000 then raise exception 'ALVIS: Answer text or cannot-confirm required'; end if;
  insert into sources(organization_id,capture_id,kind,locator,text_content)
  values(c.organization_id,c.id,'debrief','Question '||q.sequence||': '||q.question,case when coalesce((body->>'cannot_confirm')::boolean,false) then 'Contributor cannot confirm: '||q.target_field else body->>'answer' end) returning id into sid;
  update debrief_items set answer_text=body->>'answer',answer_source_id=sid,cannot_confirm=coalesce((body->>'cannot_confirm')::boolean,false) where id=q.id;
  update captures set generation=generation+1 where id=c.id returning generation into gen;
  update processing_jobs set status='cancelled',lease_token=null,lease_until=null where capture_id=c.id and stage in ('extract','debrief') and status in ('queued','running') and (payload->>'generation')::integer<gen;
  if exists(select 1 from debrief_items where capture_id=c.id and answer_source_id is null) then return jsonb_build_object('source_id',sid); end if;
 elsif operation='regenerate' then
  if r.id is null or r.content_hash is distinct from body->>'expected_hash' then raise exception 'ALVIS: Stale draft'; end if;
  gen:=c.generation;
 elsif operation='accept' then
  select * into p from extraction_proposals where id=(body->>'proposal_id')::uuid and capture_id=c.id and organization_id=c.organization_id for update;
  if not found or p.status<>'proposed' or p.generation<>c.generation or p.revision_id<>r.id or p.base_hash is distinct from r.content_hash or body->>'expected_hash' is distinct from r.content_hash then raise exception 'ALVIS: Stale proposal; regenerate from the saved draft'; end if;
  perform alvis_validate_content(p.content,c.organization_id,r.id,false);
  update knowledge_revisions set content=p.content where id=r.id;
  update extraction_proposals set status='accepted' where id=p.id;
  update captures set accepted_generation=c.generation where id=c.id;
  insert into audit_events(organization_id,actor_id,action,entity_type,entity_id) values(c.organization_id,auth.uid(),'accept_generation','knowledge_revision',r.id);
  return jsonb_build_object('revision_id',r.id);
 elsif operation='dismiss' then
  if body->>'expected_hash' is distinct from r.content_hash then raise exception 'ALVIS: Stale saved draft'; end if;
  update extraction_proposals set status='dismissed' where id=(body->>'proposal_id')::uuid and capture_id=c.id and generation=c.generation and status='proposed';
  if not found then raise exception 'ALVIS: Proposal unavailable'; end if;
  perform alvis_validate_content(r.content,c.organization_id,r.id,false);
  update captures set accepted_generation=generation where id=c.id;
  insert into audit_events(organization_id,actor_id,action,entity_type,entity_id) values(c.organization_id,auth.uid(),'retain_expert_draft','knowledge_revision',r.id);
  return '{}';
 else raise exception 'ALVIS: Invalid capture operation';
 end if;
 -- All generation paths deduplicate the same source snapshot and saved draft.
 key:='extract:'||c.id::text||':'||gen::text||':'||coalesce(r.content_hash,'initial')||':v1';
 insert into processing_jobs(organization_id,capture_id,revision_id,stage,dedupe_key,payload)
 values(c.organization_id,c.id,r.id,'extract',key,jsonb_build_object('generation',gen,'base_hash',r.content_hash))
 on conflict(organization_id,dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id into jid;
 update extraction_proposals set status='proposed' where capture_id=c.id and generation=gen and base_hash=r.content_hash and status='dismissed' and operation='regenerate';
 update captures set state=case when exists(select 1 from processing_jobs where id=jid and status in ('queued','running')) then 'queued' else 'debrief' end where id=c.id;
 return jsonb_build_object('job_id',jid);
end $$;

create function alvis_claim_job() returns setof processing_jobs language plpgsql security definer set search_path=public,pg_catalog as $$
declare j processing_jobs;
begin
 -- Exhausted abandoned jobs remain failed and visible; their captures do not appear stuck.
 update captures set state='failed' where id in(select capture_id from processing_jobs where status='running' and lease_until<now() and attempts>=3);
 update processing_jobs set status='failed',error_code='WORKER_INTERRUPTED',lease_token=null where status='running' and lease_until<now() and attempts>=3;
 select * into j from processing_jobs where stage in ('media','transcribe','extract','debrief','answer') and attempts<3 and
 ((status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now()))
 order by created_at for update skip locked limit 1;
 if not found then return; end if;
 update processing_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),error_code=null where id=j.id returning * into j;
 update captures set state='processing' where id=j.capture_id;
 return next j;
end $$;
create function alvis_heartbeat(job uuid, token uuid) returns boolean language sql security definer set search_path=public,pg_catalog as $$
 with changed as(update processing_jobs set lease_until=now()+interval '2 minutes' where id=job and lease_token=token and status='running' and lease_until>now() returning id) select exists(select 1 from changed)
$$;
create function alvis_fail_job(job uuid, token uuid, code text, temporary boolean) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare j processing_jobs;
begin
 select * into j from processing_jobs where id=job and lease_token=token and status='running' for update;
 if not found then return; end if;
 update processing_jobs set status=case when temporary and attempts<3 then 'queued'::job_state else 'failed'::job_state end,
 next_attempt_at=now()+make_interval(secs=>least(60,power(2,attempts)::integer*5)+floor(random()*5)::integer),error_code=code,lease_token=null,lease_until=null where id=j.id;
 update captures set state=case when temporary and j.attempts<3 then 'queued' else 'failed' end where id=j.capture_id;
end $$;
-- Never mutate evidence records, even through privileged worker mistakes.
create function alvis_immutable_source() returns trigger language plpgsql as $$ begin raise exception 'ALVIS: Evidence is immutable; append a source version'; end $$;
create trigger immutable_capture_source before update on sources for each row when(old.capture_id is not null) execute function alvis_immutable_source();
create function alvis_capture_submission() returns trigger language plpgsql set search_path=public,pg_catalog as $$
declare c captures;
begin
 if new.capture_id is not null and new.status='pending' and old.status='draft' then
  select * into c from captures where id=new.capture_id;
  if c.current_revision_id<>new.id or c.accepted_generation<>c.generation or exists(select 1 from processing_jobs where capture_id=c.id and status in ('queued','running')) then raise exception 'ALVIS: Review and accept the current generated proposal before submission'; end if;
  update captures set state='review' where id=c.id;
 elsif new.capture_id is not null and new.status='approved' then update captures set state='done' where id=new.capture_id;
 elsif new.capture_id is not null and new.status='draft' and old.status='pending' then update captures set state='debrief' where id=new.capture_id;
 end if;
 return new;
end $$;
create trigger capture_submission before update of status on knowledge_revisions for each row execute function alvis_capture_submission();

revoke all on function alvis_new_capture(uuid,text,text,text),alvis_capture_command(uuid,text,jsonb),alvis_claim_job(),alvis_heartbeat(uuid,uuid),alvis_fail_job(uuid,uuid,text,boolean) from public;
grant execute on function alvis_new_capture(uuid,text,text,text),alvis_capture_command(uuid,text,jsonb) to authenticated;
grant execute on function alvis_claim_job(),alvis_heartbeat(uuid,uuid),alvis_fail_job(uuid,uuid,text,boolean) to service_role;
-- Worker result commits use a fenced lease and a single transaction. No approve/publish operation exists.
create function alvis_finish_job(job uuid, token uuid, result jsonb) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
declare j processing_jobs; c captures; r knowledge_revisions; u capture_uploads; s jsonb; q debrief_items; rid uuid; uid uuid; sid uuid; gen integer; next_stage text;
begin
 select * into j from processing_jobs where id=job and lease_token=token and status='running' and lease_until>now() for update;
 if not found then raise exception 'ALVIS: Worker lease lost'; end if;
 select * into c from captures where id=j.capture_id and organization_id=j.organization_id for update;
 if j.stage in ('extract','debrief') and (j.payload->>'generation')::integer<>c.generation then
  update processing_jobs set status='cancelled',lease_token=null,completed_at=now() where id=j.id;
  update captures set state=case when exists(select 1 from processing_jobs where capture_id=c.id and status in ('queued','running')) then 'queued' else 'debrief' end where id=c.id;
  return;
 end if;
 select * into r from knowledge_revisions where id=c.current_revision_id and organization_id=c.organization_id;
 if r.id is not null and r.status<>'draft' then raise exception 'ALVIS: Submitted or reviewed content is locked'; end if;
 if j.stage='media' then
  select * into u from capture_uploads where id=(j.payload->>'upload_id')::uuid and capture_id=c.id and organization_id=c.organization_id;
  if coalesce(result->>'storage_key','') not like c.organization_id::text||'/'||c.id::text||'/verified/%' or u.storage_key<>c.storage_key or u.checksum<>result->>'checksum' or (result->>'bytes')::bigint<>u.expected_bytes or (result->>'duration')::numeric not between 0.001 and 180 then raise exception 'ALVIS: Invalid recording'; end if;
  update captures set duration_seconds=ceil((result->>'duration')::numeric),content_hash=u.checksum,storage_key=result->>'storage_key' where id=c.id;
  next_stage:='transcribe';
 elsif j.stage='transcribe' then
  if c.transcript_version<>0 or jsonb_array_length(result->'segments')=0 then raise exception 'ALVIS: Transcript missing or already saved'; end if;
  for s in select value from jsonb_array_elements(result->'segments') loop
   if length(trim(s->>'text'))=0 or (s->>'start_ms')::integer<0 or (s->>'end_ms')::integer<(s->>'start_ms')::integer or (s->>'end_ms')::integer>c.duration_seconds*1000+1000 then raise exception 'ALVIS: Invalid transcript timestamps'; end if;
   insert into sources(organization_id,capture_id,kind,locator,text_content,start_ms,end_ms,evidence_version)
   values(c.organization_id,c.id,'transcript','Recording segment',s->>'text',(s->>'start_ms')::integer,(s->>'end_ms')::integer,1);
  end loop;
  update captures set transcript_version=1,generation=generation+1 where id=c.id returning generation into gen;
  next_stage:='extract';
 elsif j.stage='extract' then
  if result->'content'->>'asset_code' is distinct from (select code from assets where id=c.asset_id and organization_id=c.organization_id) then raise exception 'ALVIS: Model asset mismatch'; end if;
  if exists(select 1 from jsonb_path_query(result->'content','$.**.evidence_ids[*]') x where not exists(select 1 from sources where id::text=x #>> '{}' and organization_id=c.organization_id and capture_id=c.id and (kind='debrief' or (kind='transcript' and evidence_version=c.transcript_version)))) then raise exception 'ALVIS: Unknown or superseded model evidence'; end if;
  if r.id is null then
   insert into knowledge_units(organization_id,asset_id,code) values(c.organization_id,c.asset_id,'CAP-'||c.id::text) returning id into uid;
   insert into knowledge_revisions(organization_id,unit_id,capture_id,version,content,created_by)
   values(c.organization_id,uid,c.id,1,result->'content',c.owner_id) returning id into rid;
  else rid:=r.id; end if;
  insert into revision_sources(organization_id,revision_id,source_id)
   select c.organization_id,rid,id from sources where capture_id=c.id and organization_id=c.organization_id and (kind='debrief' or (kind='transcript' and evidence_version=c.transcript_version)) on conflict do nothing;
  perform alvis_validate_content(result->'content',c.organization_id,rid,false);
  if r.id is null then
   update captures set current_revision_id=rid,accepted_generation=generation where id=c.id;
  else
   insert into extraction_proposals(organization_id,capture_id,revision_id,generation,base_hash,content)
   values(c.organization_id,c.id,rid,c.generation,j.payload->>'base_hash',result->'content');
  end if;
  if not exists(select 1 from debrief_items where capture_id=c.id) then next_stage:='debrief'; end if;
  insert into audit_events(organization_id,actor_id,action,entity_type,entity_id,metadata)
   values(c.organization_id,c.owner_id,'unverified_extraction','capture',c.id,jsonb_build_object('job_id',j.id,'generation',c.generation));
 elsif j.stage='debrief' then
  if jsonb_array_length(result->'questions')>5 then raise exception 'ALVIS: Five question maximum'; end if;
  if not exists(select 1 from debrief_items where capture_id=c.id) then
   for s in select value from jsonb_array_elements(result->'questions') loop
    if s->>'target_field' not in ('signal','reason','exceptions','prerequisites','stop_conditions','outcome') or length(trim(s->>'question'))=0 then raise exception 'ALVIS: Invalid debrief question'; end if;
    if exists(select 1 from jsonb_array_elements_text(s->'source_ids') x where not exists(select 1 from sources where id::text=x and organization_id=c.organization_id and capture_id=c.id)) then raise exception 'ALVIS: Unknown question source'; end if;
    insert into debrief_items(organization_id,capture_id,sequence,target_field,question,gap,source_ids)
    values(c.organization_id,c.id,(select count(*)+1 from debrief_items where capture_id=c.id),s->>'target_field',s->>'question',s->>'gap',s->'source_ids');
   end loop;
  end if;
 elsif j.stage='answer' then
  select * into u from capture_uploads where id=(j.payload->>'upload_id')::uuid and capture_id=c.id;
  select * into q from debrief_items where id=u.question_id and capture_id=c.id for update;
  if q.answer_source_id is not null or length(trim(coalesce(result->>'text','')))=0 then raise exception 'ALVIS: Audio answer unavailable'; end if;
  insert into sources(organization_id,capture_id,kind,locator,text_content,storage_key)
  values(c.organization_id,c.id,'debrief','Question '||q.sequence||': '||q.question,result->>'text',result->>'storage_key') returning id into sid;
  update debrief_items set answer_text=result->>'text',answer_source_id=sid where id=q.id;
  update captures set generation=generation+1 where id=c.id returning generation into gen;
  update processing_jobs set status='cancelled',lease_token=null,lease_until=null where capture_id=c.id and stage in ('extract','debrief') and status in ('queued','running') and (payload->>'generation')::integer<gen;
  if not exists(select 1 from debrief_items where capture_id=c.id and answer_source_id is null) then next_stage:='extract'; end if;
 end if;
 update processing_jobs set status='succeeded',completed_at=now(),lease_until=null,lease_token=null where id=j.id;
 if next_stage is not null then
  select * into c from captures where id=c.id;
  insert into processing_jobs(organization_id,capture_id,revision_id,stage,dedupe_key,payload)
  values(c.organization_id,c.id,c.current_revision_id,next_stage,next_stage||':'||c.id::text||':'||c.generation||':v1',
   jsonb_build_object('generation',c.generation,'base_hash',(select content_hash from knowledge_revisions where id=c.current_revision_id)))
  on conflict do nothing;
  update captures set state='queued' where id=c.id;
 elsif not exists(select 1 from processing_jobs where capture_id=c.id and status in ('queued','running')) then
  update captures set state='debrief' where id=c.id;
 end if;
end $$;
revoke all on function alvis_finish_job(uuid,uuid,jsonb) from public;
grant execute on function alvis_finish_job(uuid,uuid,jsonb) to service_role;

-- Null rationale is legitimate unconfirmed extraction; it must block submission, not initial draft storage.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('alvis_validate_content(jsonb,uuid,uuid,boolean)'::regprocedure);
 definition:=replace(definition,
 'jsonb_typeof(item->''rationale'') is distinct from ''string'' or length(trim(item->>''rationale''))=0',
 '((complete and (jsonb_typeof(item->''rationale'') is distinct from ''string'' or length(trim(item->>''rationale''))=0)) or (not complete and jsonb_typeof(item->''rationale'') not in (''string'',''null'')))');
 execute definition;
end $$;
-- Keep recording provenance when an owning expert starts a correction revision.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('alvis_copy_draft(uuid)'::regprocedure);
 definition:=replace(definition,
 'insert into public.knowledge_revisions(organization_id,unit_id,version,content,created_by) values(u.organization_id,u.id,next_version,r.content,auth.uid())',
 'insert into public.knowledge_revisions(organization_id,unit_id,version,content,created_by,capture_id) values(u.organization_id,u.id,next_version,r.content,auth.uid(),case when exists(select 1 from public.captures where id=r.capture_id and owner_id=auth.uid()) then r.capture_id else null end)');
 definition:=replace(definition,'return draft_id;',
 'update public.captures set current_revision_id=draft_id,state=''debrief'' where id=r.capture_id and owner_id=auth.uid(); return draft_id;');
 execute definition;
end $$;
-- Keep unused/superseded capture evidence in expert/reviewer history without exposing it to workers.
drop policy source_read on sources;
create policy source_read on sources for select to authenticated using(
 alvis_role(organization_id) in ('admin','reviewer') or
 (alvis_role(organization_id)='expert' and exists(select 1 from captures c where c.id=capture_id and c.organization_id=sources.organization_id and c.owner_id=auth.uid())) or
 exists(select 1 from revision_sources rs join knowledge_revisions r on r.id=rs.revision_id and r.organization_id=rs.organization_id
 where rs.source_id=sources.id and rs.organization_id=sources.organization_id and
 ((alvis_role(sources.organization_id)='expert' and r.created_by=auth.uid()) or
 (r.status='approved' and r.index_ready and alvis_worker_unit_visible(r.organization_id,r.unit_id) and exists(select 1 from jsonb_path_query(r.content,'$.**.evidence_ids[*]') e where e #>> '{}' = sources.id::text))))
);
