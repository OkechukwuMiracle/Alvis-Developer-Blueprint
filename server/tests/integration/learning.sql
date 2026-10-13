set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select alvis_transition(id,'submit',null,content_hash,'','') from knowledge_revisions;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_transition(id,'approve',null,content_hash,'Reviewed','learning-review') from knowledge_revisions;
select pg_temp.assert_true((select not index_ready from knowledge_revisions),'publication waits for actual index completion');
select pg_temp.assert_true((select count(*)=1 from processing_jobs where stage='index'),'approval queues one durable job');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from knowledge_revisions),'unindexed approved revision is hidden');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_start','60000000-0000-4000-8000-000000000001','{"simulation_ack":true,"prerequisites_ack":true}')$q$),'cannot guide unindexed revision');
reset role;
select pg_temp.flush_indexes();
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from alvis_hybrid_search('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','judgment',('[1,'||array_to_string(array_fill(0,array[1535]),',')||']')::vector,'sql-test-only')),'hybrid retrieves approved current indexed revision');
select pg_temp.assert_true((select count(*)=0 from alvis_hybrid_search('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','secret',('[1,'||array_to_string(array_fill(0,array[1535]),',')||']')::vector,'sql-test-only')),'other organization retrieval is denied');
select pg_temp.assert_true((select count(*)=0 from alvis_hybrid_search('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','judgment',('[1,'||array_to_string(array_fill(0,array[1535]),',')||']')::vector,'sql-test-only')),'selected asset is mandatory');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_start','60000000-0000-4000-8000-000000000001','{}')$q$),'guide acknowledgements required');
select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_start','60000000-0000-4000-8000-000000000001','{"simulation_ack":true,"prerequisites_ack":true}')->>'id' as guide \gset
select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_advance',:'guide','{"expected_position":0,"action":"next"}');
select pg_temp.assert_true(pg_temp.denied(format('select alvis_learning_command(%L,%L,%L,%L)','10000000-0000-4000-8000-000000000001','guide_advance',:'guide','{"expected_position":0,"action":"next"}')),'stale guide position rejected');
select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_advance',:'guide','{"expected_position":1,"action":"finish","outcome":"completed_in_simulation"}');
select pg_temp.assert_true((select state='completed' from guide_sessions where id=:'guide'),'completed guide persists');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_learning_command('10000000-0000-4000-8000-000000000001','lesson_generate','60000000-0000-4000-8000-000000000001','{}');
reset role;
set local role service_role;
select id as lesson_job,lease_token as lesson_token from alvis_claim_learning_job() \gset
select alvis_finish_lesson(:'lesson_job',:'lesson_token',jsonb_build_object('title','Test lesson','revision_id','60000000-0000-4000-8000-000000000001','explanation',trim(repeat('Training ',130)),'evidence_ids',jsonb_build_array('40000000-0000-4000-8000-000000000001'),'questions',(select jsonb_agg(jsonb_build_object('id','Q'||i,'prompt','Test question '||i,'options',jsonb_build_array('A','B','C','D'),'correct_index',i-1,'explanation','Reviewed test explanation','evidence_ids',jsonb_build_array('40000000-0000-4000-8000-000000000001'))) from generate_series(1,3) i))) as lesson \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);

-- Stale completion and invalid vectors cannot publish partial chunks.
reset role;
insert into processing_jobs(organization_id,revision_id,stage,dedupe_key,payload) select organization_id,id,'index','negative-index',jsonb_build_object('content_hash',content_hash) from knowledge_revisions;
set local role service_role;
select id as negative_job,lease_token as negative_token from alvis_claim_learning_job() \gset
select pg_temp.assert_true(pg_temp.denied(format('select alvis_finish_index(%L,%L,%L,%L)',:'negative_job','80000000-0000-4000-8000-000000000001','[]','sql-test-only')),'index completion is lease fenced');
select pg_temp.assert_true(pg_temp.denied(format('select alvis_finish_index(%L,%L,%L,%L)',:'negative_job',:'negative_token','[{"ordinal":0,"text":"invalid","evidence_ids":[],"embedding":[1,2]}]','sql-test-only')),'wrong vector dimensions rejected in SQL');
select alvis_fail_job(:'negative_job',:'negative_token','TRANSIENT',true);
reset role;
select pg_temp.assert_true((select status='queued' and attempts=1 and next_attempt_at>now() from processing_jobs where id=:'negative_job'),'index retry persists bounded backoff');
update processing_jobs set status='running',attempts=3,lease_until=now()-interval '1 second',lease_token=gen_random_uuid() where id=:'negative_job';
set local role service_role;
select count(*) from alvis_claim_learning_job();
reset role;
select pg_temp.assert_true((select status='failed' from processing_jobs where id=:'negative_job'),'exhausted index lease fails permanently');
-- Invalid states and duplicate chunks cannot affect worker context.
insert into knowledge_revisions(id,organization_id,unit_id,version,status,content,index_ready,created_by)
select gen_random_uuid(),organization_id,unit_id,version+row_number() over(),state::revision_state,content,true,created_by from knowledge_revisions cross join (values('draft'),('pending'),('rejected'),('retired')) states(state) where version=1;
insert into knowledge_chunks(organization_id,revision_id,ordinal,text_content,evidence_ids,embedding,embedding_model)
select organization_id,id,0,'secret unreviewed draft',array['40000000-0000-4000-8000-000000000001'::uuid],('[1,'||array_to_string(array_fill(0,array[1535]),',')||']')::vector,'sql-test-only' from knowledge_revisions where status<>'approved';
insert into knowledge_chunks(organization_id,revision_id,ordinal,text_content,evidence_ids,embedding,embedding_model) select organization_id,revision_id,1,text_content,evidence_ids,embedding,embedding_model from knowledge_chunks where revision_id='60000000-0000-4000-8000-000000000001' and ordinal=0;
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from alvis_hybrid_search('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','secret draft',('[1,'||array_to_string(array_fill(0,array[1535]),',')||']')::vector,'sql-test-only')),'all nonapproved states excluded and revisions deduplicated');
select pg_temp.assert_true((select count(*)=2 from knowledge_chunks),'RLS hides every unreviewed chunk');
select pg_temp.assert_true(not alvis_is_active('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001'),'active metadata function cannot cross tenants');

select pg_temp.assert_true((select count(*)=0 from lessons),'worker cannot read keys or lesson drafts through REST');
select pg_temp.assert_true(pg_temp.denied(format('select alvis_learning_command(%L,%L,%L,%L)','10000000-0000-4000-8000-000000000001','lesson_get',:'lesson','{}')),'unreviewed lesson endpoint denied');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_learning_command('10000000-0000-4000-8000-000000000001','lesson_review',:'lesson',jsonb_build_object('decision','approve','expected_hash',content_hash,'comment','Human checked recognition, reason, exceptions and sources.')) from lessons where id=:'lesson';
select pg_temp.assert_true(pg_temp.denied(format('update lessons set content=%L where id=%L','{}',:'lesson')),'approved lesson cannot be changed directly');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not (alvis_learning_command('10000000-0000-4000-8000-000000000001','lesson_get',:'lesson','{}')::text like '%correct_index%'),'initial lesson contains no answer keys');
select pg_temp.assert_true((alvis_learning_command('10000000-0000-4000-8000-000000000001','attempt',:'lesson','{"submission_key":"70000000-0000-4000-8000-000000000001","responses":{"Q1":0,"Q2":1,"Q3":2},"correct_count":0}')->>'correct_count')::integer=3,'score calculated on server despite client total');
select alvis_learning_command('10000000-0000-4000-8000-000000000001','attempt',:'lesson','{"submission_key":"70000000-0000-4000-8000-000000000001","responses":{"Q1":0,"Q2":1,"Q3":2}}');
select pg_temp.assert_true((select count(*)=1 from assessment_attempts),'duplicate assessment submission is idempotent');
select alvis_learning_command('10000000-0000-4000-8000-000000000001','attempt',:'lesson','{"submission_key":"70000000-0000-4000-8000-000000000002","responses":{"Q1":1,"Q2":1,"Q3":2}}');
select pg_temp.assert_true((select count(*)=2 from assessment_attempts),'retake is a separate record');
select pg_temp.assert_true(pg_temp.denied(format('select alvis_learning_command(%L,%L,%L,%L)','10000000-0000-4000-8000-000000000002','lesson_get',:'lesson','{}')),'foreign lesson cannot be read');
select alvis_reserve_ask('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Training question') as ask \gset
select pg_temp.assert_true(pg_temp.denied(format('select alvis_record_answer(%L,%L,%L)',:'ask','{"claims":[{"revision_id":"60000000-0000-4000-8000-000000000001","evidence_ids":["40000000-0000-4000-8000-000000000002"]}]}','{60000000-0000-4000-8000-000000000001}')),'unknown or cross-tenant evidence denied before answer save');
select alvis_learning_command('10000000-0000-4000-8000-000000000001','guide_start','60000000-0000-4000-8000-000000000001','{"simulation_ack":true,"prerequisites_ack":true}')->>'id' as stale_guide \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_learning_command('10000000-0000-4000-8000-000000000001','retire','60000000-0000-4000-8000-000000000001','{"comment":"Withdrawn by reviewer"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select state='invalidated' from guide_sessions where id=:'stale_guide'),'retirement invalidates guides');
select pg_temp.assert_true(pg_temp.denied(format('select alvis_learning_command(%L,%L,%L,%L)','10000000-0000-4000-8000-000000000001','lesson_get',:'lesson','{}')),'retired revision lesson unavailable');
select pg_temp.assert_true((select count(*)=0 from knowledge_chunks),'retirement removes retrieval chunks');
select pg_temp.assert_true(jsonb_array_length(alvis_learning_history('10000000-0000-4000-8000-000000000001')->'attempts')=2,'history preserves previous results');
reset role;
select 'PASS: approved retrieval, isolation, guide retirement, hidden keys and server scoring';
rollback;
