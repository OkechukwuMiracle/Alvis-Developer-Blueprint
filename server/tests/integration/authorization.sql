\set ON_ERROR_STOP on
begin;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),('00000000-0000-4000-8000-000000000005');
insert into organizations(id,name,demo_only) values ('10000000-0000-4000-8000-000000000001','Test tenant',true),('10000000-0000-4000-8000-000000000002','Other tenant',true);
insert into memberships values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','expert','Expert'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','reviewer','Reviewer'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','worker','Worker'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','expert','Other expert'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000005','reviewer','Other reviewer');
insert into sites(id,organization_id,name) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Lab'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other lab');
insert into assets(id,organization_id,site_id,code,name) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','SIM','Simulator'),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','OTHER','Other simulator');
insert into sources(id,organization_id,kind,locator,text_content,synthetic) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','expert_note','paragraph 1','Synthetic evidence',true),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','expert_note','paragraph 1','Unique other-tenant secret',true);
insert into knowledge_units(id,organization_id,asset_id,code) values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','TEST');
insert into knowledge_revisions(id,organization_id,unit_id,version,content,created_by)
 select '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,
 jsonb_build_object('title','Synthetic judgment','asset_code','SIM','task','Training',
 'situation',claim,'signal',claim,'interpretation',claim,'decision',claim,'reason',claim,'outcome',claim,
 'exceptions',jsonb_build_array(claim),'prerequisites',jsonb_build_array(claim),'stop_conditions',jsonb_build_array(claim),
 'steps',jsonb_build_array(jsonb_build_object('order',1,'instruction','Confirm training context','rationale','Applicability','evidence_ids',jsonb_build_array('40000000-0000-4000-8000-000000000001'),'requires_authorized_person',true)),
 'skill_tags',jsonb_build_array('Recognition'),'missing_information','[]'::jsonb,'contradictions','[]'::jsonb),
 '00000000-0000-4000-8000-000000000001'
 from (select jsonb_build_object('text','Training only','basis','explicit','evidence_ids',jsonb_build_array('40000000-0000-4000-8000-000000000001')) claim) x;
insert into revision_sources values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');

create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
create function pg_temp.denied(statement text) returns boolean language plpgsql as $$ begin execute statement; return false; exception when others then return true; end $$;
select pg_temp.assert_true(pg_temp.denied($q$insert into revision_sources values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')$q$),'composite foreign key blocks cross-tenant evidence');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from knowledge_revisions),'worker cannot read drafts');
select pg_temp.assert_true((select count(*)=0 from sources),'worker cannot read draft or cross-tenant sources');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition('60000000-0000-4000-8000-000000000001','approve',null,'','Worker publish','worker-key')$q$),'worker cannot approve');
select pg_temp.assert_true(pg_temp.denied($q$update knowledge_revisions set status='approved'$q$),'direct writes denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from knowledge_revisions),'expert sees own draft');
select pg_temp.assert_true((select count(*)=1 from sources),'expert sees linked own source only');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition('60000000-0000-4000-8000-000000000001','approve',null,'','Self review','self-key')$q$),'expert cannot approve');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition('60000000-0000-4000-8000-000000000001','save',null,'stale','','')$q$),'stale content rejected');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'save',jsonb_set(content,'{signal,evidence_ids}','["40000000-0000-4000-8000-000000000002"]'),content_hash,'','') from knowledge_revisions$q$),'foreign evidence rejected in database');
select alvis_transition(id,'submit',null,content_hash,'','') from knowledge_revisions;
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'save',content,content_hash,'','') from knowledge_revisions$q$),'pending content locked');

reset role;
update memberships set role='reviewer' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'approve',null,content_hash,'Self review','self-key') from knowledge_revisions$q$),'reviewer cannot approve own authored draft');
reset role;
update memberships set role='expert' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true((select count(*)=0 from knowledge_revisions),'other tenant cannot see revision');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition('60000000-0000-4000-8000-000000000001','approve',null,'','Cross tenant','cross-key')$q$),'cross-tenant transition denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select pg_temp.assert_true((select count(*)=1 from sources),'other-tenant reviewer sees their private source');
select pg_temp.assert_true((select count(*)=0 from knowledge_revisions),'other-tenant reviewer cannot read this tenant revisions');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition('60000000-0000-4000-8000-000000000001','approve',null,'','Foreign reviewer','foreign-reviewer-key')$q$),'review privilege does not cross tenant boundaries');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'approve',null,content_hash,'','empty-key') from knowledge_revisions$q$),'approval comment required');
select content_hash as original_hash from knowledge_revisions \gset
select alvis_transition(id,'approve',null,content_hash,'Evidence checked','approval-key') from knowledge_revisions;
select alvis_transition('60000000-0000-4000-8000-000000000001','approve',null,:'original_hash','Evidence checked','approval-key');
select pg_temp.assert_true((select count(*)=1 from reviews),'idempotent approval creates one review');
select pg_temp.assert_true((select count(*)=2 from audit_events),'submission and approval audited atomically');
select pg_temp.assert_true((select count(*)=1 from knowledge_text_index),'publication keyword index exists');
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'approve',null,content_hash,'Changed comment','approval-key') from knowledge_revisions$q$),'idempotency conflicts rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from knowledge_revisions),'worker reads approved current indexed revision');
select pg_temp.assert_true((select count(*)=1 from sources),'worker reads approved source only');
select pg_temp.assert_true((select count(*)=1 from knowledge_units),'worker reads approved unit');
select pg_temp.assert_true((select count(*)=1 from alvis_review_summaries('10000000-0000-4000-8000-000000000001') where reviewer_name='Reviewer'),'worker sees approving reviewer name');
select pg_temp.assert_true((select count(*)=0 from alvis_review_summaries('10000000-0000-4000-8000-000000000002')),'review metadata remains tenant isolated');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select alvis_copy_draft('50000000-0000-4000-8000-000000000001') as new_revision \gset
select pg_temp.assert_true((select count(*)=2 from knowledge_revisions),'copy creates next revision');
select pg_temp.assert_true((select version=2 from knowledge_revisions where id=:'new_revision'),'version increment');
select alvis_transition(id,'submit',null,content_hash,'','') from knowledge_revisions where id=:'new_revision';
reset role;
update knowledge_revisions set content=jsonb_set(content,'{missing_information}','["Unresolved prerequisite"]') where id=:'new_revision';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(pg_temp.denied($q$select alvis_transition(id,'approve',null,content_hash,'Incomplete review','incomplete-key') from knowledge_revisions where status='pending'$q$),'incomplete publication blocked');
select pg_temp.assert_true((select active_revision_id='60000000-0000-4000-8000-000000000001' from knowledge_units),'failed approval preserves current pointer');
select pg_temp.assert_true((select count(*)=0 from reviews where decision='approve' and revision_id=:'new_revision'),'failed publication has no approval record');
reset role;
update knowledge_revisions set content=jsonb_set(content,'{missing_information}','[]') where id=:'new_revision';
set local role authenticated;
select alvis_transition(id,'request_changes',null,content_hash,'reason: clarify supporting evidence','changes-key') from knowledge_revisions where id=:'new_revision';
select pg_temp.assert_true((select status='draft' from knowledge_revisions where id=:'new_revision'),'request changes returns draft');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select alvis_transition(id,'submit',null,content_hash,'','') from knowledge_revisions where id=:'new_revision';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_transition(id,'approve',null,content_hash,'Replacement evidence checked','replace-key') from knowledge_revisions where id=:'new_revision';
select pg_temp.assert_true((select status='retired' from knowledge_revisions where id='60000000-0000-4000-8000-000000000001'),'old revision retired');
select pg_temp.assert_true((select count(*)=1 from knowledge_revisions where status='approved'),'only one approved revision');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select alvis_copy_draft('50000000-0000-4000-8000-000000000001') as rejected_revision \gset
select alvis_transition(id,'submit',null,content_hash,'','') from knowledge_revisions where id=:'rejected_revision';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select alvis_transition(id,'reject',null,content_hash,'Unsupported interpretation','reject-key') from knowledge_revisions where id=:'rejected_revision';
select pg_temp.assert_true((select status='rejected' from knowledge_revisions where id=:'rejected_revision'),'rejected draft remains unavailable');
select pg_temp.assert_true((select active_revision_id=:'new_revision' from knowledge_units),'rejection leaves existing published version active');
reset role;
select pg_temp.assert_true(pg_temp.denied($q$update knowledge_revisions set content=jsonb_set(content,'{title}','"Changed reviewed title"') where status='approved'$q$),'reviewed content immutable even for server');
update knowledge_revisions set index_ready=false where id=:'new_revision';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from knowledge_revisions),'worker cannot read unindexed revisions');
select pg_temp.assert_true((select count(*)=0 from sources),'worker cannot read unindexed source');
select pg_temp.assert_true((select count(*)=0 from knowledge_units),'worker cannot read unindexed unit');
select pg_temp.assert_true((select count(*)=0 from alvis_review_summaries('10000000-0000-4000-8000-000000000001')),'unindexed approval metadata hidden');
reset role;
rollback;
\echo 'PASS: workflow, RLS, evidence, versioning, immutable approval, idempotency and two-tenant isolation'
