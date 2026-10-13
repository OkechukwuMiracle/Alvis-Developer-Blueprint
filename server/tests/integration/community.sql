-- Disposable SQL harness: synthetic users, evidence and vectors; not real signup or AI processing.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('ac000000-0000-4000-8000-000000000001','expert@community.test',now()),
 ('ac000000-0000-4000-8000-000000000002','reviewer@community.test',now()),
 ('ac000000-0000-4000-8000-000000000003','worker@community.test',now()),
 ('ac000000-0000-4000-8000-000000000004','unverified@community.test',null);
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement; exception when others then return; end; raise exception 'FAIL: expected denial: %',statement; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000004',true);
select pg_temp.denied($q$select alvis_activate_personal('Unverified','reviewer')$q$);
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select alvis_activate_personal('Expert Contributor','expert') as scope \gset
select pg_temp.assert_true(alvis_activate_personal('Changed Name','reviewer')=:'scope','activation retries retain original scope');
select pg_temp.assert_true(alvis_role(:'scope')='expert','retry cannot self-promote role');
select alvis_create_organization('Independent private organization','Expert Contributor','ac000000-0000-4000-8000-000000000009') as private_org \gset
select pg_temp.assert_true(alvis_role(:'private_org')='admin','same identity can create a real organization');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select alvis_create_organization('Existing private membership','Private administrator','ac000000-0000-4000-8000-000000000010') as reviewer_org \gset
select alvis_activate_personal('Community Reviewer','reviewer') as reviewer_scope \gset
select pg_temp.assert_true(alvis_role(:'reviewer_org')='admin','activating community reviewer preserves existing organization membership');
select pg_temp.assert_true(alvis_role(:'private_org') is null,'public reviewer grants no organization role');
select pg_temp.assert_true(alvis_role(:'scope') is null,'reviewer has no author private scope access');
select pg_temp.denied(format($q$select alvis_admin_command(%L,'asset','{"code":"FORBIDDEN","name":"Forbidden"}')$q$,:'private_org'));
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select alvis_activate_personal('Community Learner','worker') as worker_scope \gset
reset role;
select id as asset from assets where organization_id=:'scope' limit 1 \gset
insert into captures(id,organization_id,asset_id,owner_id,title,consent_at,consent_version,state,accepted_generation)
 values('ac100000-0000-4000-8000-000000000001',:'scope',:'asset','ac000000-0000-4000-8000-000000000001','Synthetic private recording',now(),'capture-v1','debrief',1);
insert into knowledge_units(id,organization_id,asset_id,code) values('ac200000-0000-4000-8000-000000000001',:'scope',:'asset','COMMUNITY-TEST');
-- __SOURCES__
insert into knowledge_revisions(id,organization_id,unit_id,version,content,created_by,capture_id)
 values('ac300000-0000-4000-8000-000000000001',:'scope','ac200000-0000-4000-8000-000000000001',1,'__CONTENT__'::jsonb,'ac000000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001');
insert into revision_sources select :'scope','ac300000-0000-4000-8000-000000000001',id from sources where organization_id=:'scope';
update captures set current_revision_id='ac300000-0000-4000-8000-000000000001',generation=1,accepted_generation=1 where id='ac100000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select audience='personal_private' from captures where id='ac100000-0000-4000-8000-000000000001'),'personal audience explicit');
select content_hash as hash from knowledge_revisions where id='ac300000-0000-4000-8000-000000000001' \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select pg_temp.denied(format($q$select alvis_transition('ac300000-0000-4000-8000-000000000001','submit',null,%L,'','')$q$,:'hash'));
select pg_temp.denied(format($q$select alvis_submit_community('ac300000-0000-4000-8000-000000000001',%L,'[]','Training','Conveyor',false,false)$q$,:'hash'));
select alvis_submit_community('ac300000-0000-4000-8000-000000000001',:'hash','__SELECTIONS__'::jsonb,'Training','Conveyor',true,true) as publication \gset
select pg_temp.denied(format($q$select alvis_review_community(%L,'claim','','')$q$,:'publication'));
reset role;
-- Exercise author separation even when the author has reviewer eligibility.
update community_profiles set role='reviewer' where user_id='ac000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.denied(format($q$select alvis_review_community(%L,'claim','','')$q$,:'publication'));
reset role;
update community_profiles set role='expert' where user_id='ac000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(alvis_public_library())=0,'pending excluded from public library');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from captures where organization_id=:'scope'),'reviewer cannot inspect raw recordings');
select pg_temp.assert_true((select count(*)=0 from sources where organization_id=:'scope'),'reviewer cannot inspect unshared base evidence');
select pg_temp.assert_true((select count(*)=0 from community_publications where id=:'publication'),'unassigned reviewer cannot inspect submitted excerpts');
select pg_temp.assert_true(alvis_community_queue()->0->'excerpts'='[]'::jsonb,'unassigned queue provides metadata only');
select alvis_review_community(:'publication','claim','','');
select pg_temp.assert_true((select count(*)=1 from community_publications where id=:'publication'),'assignment permits submitted projection inspection');
select alvis_review_community(:'publication','approve',:'hash','Synthetic supporting evidence checked');
select pg_temp.assert_true(jsonb_array_length(alvis_public_library())=0,'approved but unindexed excluded');
reset role;
select pg_temp.flush_indexes();
set local role anon;
select pg_temp.assert_true(jsonb_array_length(alvis_public_library())=1,'anonymous browse only explicit active indexed publication');
select pg_temp.assert_true(not (alvis_public_library()::text like '%storage_key%'),'public payload excludes raw media keys');
select pg_temp.denied($q$select * from captures$q$);
select pg_temp.denied($q$select alvis_community_learning('history',null,'{}')$q$);
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from alvis_public_search('clicking',('[1,'||repeat('0,',1534)||'0]')::vector,'sql-test-only','Conveyor')),'public retrieval ranks allowed revision only');
select pg_temp.denied($q$select alvis_community_record_answer('A training question','{}','{}')$q$);
select pg_temp.denied($q$select alvis_community_record_answer('A training question','{"mode":"answer","summary":"Unknown citation","claims":[{"text":"Unsupported","revision_id":"ac300000-0000-4000-8000-000000000001","evidence_ids":["ac999999-0000-4000-8000-000000000001"]}],"clarifying_question":null,"escalation_reason":null}',array['ac300000-0000-4000-8000-000000000001'::uuid])$q$);
select alvis_reserve_community_question('Synthetic bounded question') from generate_series(1,10);
select pg_temp.denied($q$select alvis_reserve_community_question('Synthetic question exceeding rate')$q$);
select alvis_community_learning('guide_start',:'publication','{"request_id":"ac400000-0000-4000-8000-000000000001","simulation_ack":true,"prerequisites_ack":true}')->>'id' as guide \gset
select pg_temp.assert_true(alvis_community_learning('guide_start',:'publication','{"request_id":"ac400000-0000-4000-8000-000000000001","simulation_ack":true,"prerequisites_ack":true}')->>'id'=:'guide','duplicate guide start is idempotent');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select alvis_community_learning('lesson_generate',:'publication','{}')->>'job_id' as lesson_job \gset
reset role;
update processing_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=:'lesson_job' returning lease_token as lesson_token \gset
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('alvis.community_lesson',alvis_finish_lesson(:'lesson_job',:'lesson_token','__LESSON__'::jsonb)::text,true);
reset role;
create function pg_temp.community_lesson() returns uuid language sql as $$ select current_setting('alvis.community_lesson')::uuid $$;
select content_hash as lesson_hash from community_lessons where id=pg_temp.community_lesson() \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select alvis_community_learning('lesson_get',pg_temp.community_lesson(),'{}')$q$);
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select alvis_community_learning('lesson_review',pg_temp.community_lesson(),jsonb_build_object('decision','approve','reason','Synthetic lesson independently checked','expected_hash',:'lesson_hash'));
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select content from community_lessons$q$);
select pg_temp.assert_true(not (alvis_community_learning('lesson_get',pg_temp.community_lesson(),'{}')::text like '%correct_index%'),'initial worker payload hides keys');
select alvis_community_learning('attempt',pg_temp.community_lesson(),'{"submission_key":"ac600000-0000-4000-8000-000000000001","responses":__RESPONSES__}') as result \gset
select pg_temp.assert_true(:'result'::jsonb->>'correct_count'='3','answers are scored by server');
select alvis_community_learning('attempt',pg_temp.community_lesson(),'{"submission_key":"ac600000-0000-4000-8000-000000000001","responses":__RESPONSES__}');
select pg_temp.assert_true(jsonb_array_length(alvis_community_learning('history',null))=1,'personal history persists');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(jsonb_array_length(alvis_community_learning('history',null))=0,'other user cannot read learner history');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select alvis_copy_draft('ac200000-0000-4000-8000-000000000001') as correction \gset
select pg_temp.assert_true((select version=2 and status='draft' and audience='personal_private' from knowledge_revisions where id=:'correction'),'correction creates private version without changing approval');
select content_hash as correction_hash from knowledge_revisions where id=:'correction' \gset
select alvis_transition(:'correction','save','__CONTENT__'::jsonb||jsonb_build_object('title','Synthetic corrected contribution'),:'correction_hash','','community-correction-save');
select pg_temp.assert_true((select content->>'title'<>'Synthetic corrected contribution' from knowledge_revisions where id='ac300000-0000-4000-8000-000000000001'),'approved content remains immutable');
select content_hash as correction_hash from knowledge_revisions where id=:'correction' \gset
select alvis_submit_community(:'correction',:'correction_hash','__SELECTIONS__'::jsonb,'Training','Conveyor',true,true) as replacement \gset
select pg_temp.assert_true(alvis_community_visible(:'publication'),'old reviewed version remains active during correction review');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select alvis_review_community(:'replacement','claim','','');
select alvis_review_community(:'replacement','approve',:'correction_hash','Reviewed the corrected version and its supporting excerpts');
reset role;
select pg_temp.flush_indexes();
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not alvis_community_visible(:'publication') and alvis_community_visible(:'replacement'),'replacement retires previous public revision');
select pg_temp.assert_true(alvis_community_learning('guide_get',:'guide','{}')->>'state'='invalidated','replacement invalidates old pinned guide');
select pg_temp.assert_true((select count(*)=1 and bool_and(revision_id=:'correction') from alvis_public_search('clicking',('[1,'||repeat('0,',1534)||'0]')::vector,'sql-test-only','Conveyor')),'retrieval excludes retired version after replacement');
select alvis_community_learning('guide_start',:'replacement','{"request_id":"ac400000-0000-4000-8000-000000000002","simulation_ack":true,"prerequisites_ack":true}')->>'id' as guide \gset
select :'replacement' as publication \gset
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select alvis_withdraw_community(:'publication');
select pg_temp.assert_true(jsonb_array_length(alvis_public_library())=0,'withdrawal removes discovery');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(alvis_community_learning('guide_get',:'guide','{}')->>'state'='invalidated','withdrawal invalidates pinned guide');
select pg_temp.denied($q$select alvis_community_learning('lesson_get',pg_temp.community_lesson(),'{}')$q$);
rollback;
select 'PASS: community isolation, review, retrieval, learning and withdrawal';
