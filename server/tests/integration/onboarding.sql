-- Database authorization tests use disposable auth fixtures, NOT actual signup or delivered emails.
begin;
insert into auth.users(id,email,email_confirmed_at) values
('a9000000-0000-4000-8000-000000000001','admin@onboarding.test',now()),
('a9000000-0000-4000-8000-000000000002','expert@onboarding.test',now()),
('a9000000-0000-4000-8000-000000000003','wrong@onboarding.test',now()),
('a9000000-0000-4000-8000-000000000004','unverified@onboarding.test',null);
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement;exception when others then return;end;raise exception 'FAIL: expected denial: %',statement;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000004',true);
select pg_temp.denied($q$select alvis_create_organization('Not verified','Unverified','b9000000-0000-4000-8000-000000000001')$q$);
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
select alvis_create_organization('Fresh organization','Admin','b9000000-0000-4000-8000-000000000001') as org \gset
select pg_temp.assert_true(alvis_create_organization('Fresh organization','Admin','b9000000-0000-4000-8000-000000000001')=:'org','duplicate create idempotent');
select pg_temp.assert_true(alvis_role(:'org')='admin','creator admin');
select pg_temp.assert_true((select count(*)=0 from assets where organization_id=:'org'),'honest empty assets');
select pg_temp.denied(format($q$select alvis_create_organization('Another organization','Admin','b9000000-0000-4000-8000-000000000002')$q$));
select alvis_admin_command(:'org','asset','{"code":"TRAIN-1","name":"Training prop"}') as asset \gset
select pg_temp.assert_true(alvis_admin_command(:'org','asset','{"code":"TRAIN-1","name":"Training prop"}')=:'asset','asset duplicate idempotent');
select alvis_invitation(:'org','create',jsonb_build_object('email','expert@onboarding.test','role','expert','request_id','c9000000-0000-4000-8000-000000000001','token_hash',repeat('a',64))) as invite \gset
select pg_temp.assert_true(alvis_invitation(:'org','create',jsonb_build_object('email','expert@onboarding.test','role','reviewer','request_id','c9000000-0000-4000-8000-000000000001','token_hash',repeat('b',64)))=:'invite','duplicate invite preserves first role');
select pg_temp.denied(format($q$select token_hash from member_invitations where id=%L$q$,:'invite'));
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from organizations where id=:'org'),'unrelated signup cannot read organization');
select pg_temp.denied($q$select alvis_accept_invitation(repeat('a',64),'Wrong User')$q$);
select pg_temp.denied(format($q$select alvis_admin_command(%L,'asset','{"code":"X","name":"Foreign asset"}')$q$,:'org'));
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(alvis_accept_invitation(repeat('a',64),'Expert')=:'org','intended verified email accepted');
select pg_temp.assert_true(alvis_accept_invitation(repeat('a',64),'Expert')=:'org','duplicate acceptance idempotent');
select pg_temp.assert_true(alvis_role(:'org')='expert','invited role assigned on server');
select pg_temp.denied(format($q$select alvis_admin_command(%L,'role','{"user_id":"a9000000-0000-4000-8000-000000000002","role":"admin"}')$q$,:'org'));
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
select alvis_invitation(:'org','create',jsonb_build_object('email','wrong@onboarding.test','role','worker','request_id','c9000000-0000-4000-8000-000000000002','token_hash',repeat('b',64))) as revoked \gset
select alvis_invitation(:'org','revoke',jsonb_build_object('id',:'revoked'));
select alvis_invitation(:'org','create',jsonb_build_object('email','wrong@onboarding.test','role','worker','request_id','c9000000-0000-4000-8000-000000000003','token_hash',repeat('c',64))) as expired \gset
reset role;
update member_invitations set expires_at=now()-interval '1 minute' where id=:'expired';
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select alvis_accept_invitation(repeat('b',64),'Wrong User')$q$);
select pg_temp.denied($q$select alvis_accept_invitation(repeat('c',64),'Wrong User')$q$);
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
select alvis_invitation(:'org','resend',jsonb_build_object('id',:'expired','token_hash',repeat('d',64)));
select alvis_admin_command(:'org','role','{"user_id":"a9000000-0000-4000-8000-000000000002","role":"reviewer"}');
select pg_temp.denied(format($q$select alvis_admin_command(%L,'role','{"user_id":"a9000000-0000-4000-8000-000000000001","role":"worker"}')$q$,:'org'));
select alvis_admin_command(:'org','remove','{"user_id":"a9000000-0000-4000-8000-000000000002"}');
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(alvis_role(:'org') is null,'removed member immediately loses role');
select pg_temp.denied($q$select alvis_accept_invitation(repeat('a',64),'Expert')$q$);
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select alvis_accept_invitation(repeat('c',64),'Wrong User')$q$);
select pg_temp.assert_true(alvis_accept_invitation(repeat('d',64),'Wrong User')=:'org','resend issued new token');
select pg_temp.assert_true(alvis_role(:'org')='worker','resend preserves authorized role');
select pg_temp.denied(format('select alvis_demo_reset(%L,%L)',:'org',:'org'));
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
select pg_temp.denied(format('select alvis_demo_reset(%L,%L)',:'org',:'org'));
reset role;
update auth.users set email_confirmed_at=now() where id='a9000000-0000-4000-8000-000000000004';
update organizations set demo_only=true where id=:'org';
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000004',true);
select alvis_create_organization('Other reset protected','Other Admin','b9000000-0000-4000-8000-000000000004') as other_org \gset
select alvis_admin_command(:'other_org','asset','{"code":"OTHER","name":"Untouched training asset"}');
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
select pg_temp.denied(format('select alvis_demo_reset(%L,%L)',:'org',:'other_org'));
select alvis_demo_reset(:'org',:'org');
reset role;
select pg_temp.assert_true((select count(*)=1 from assets where organization_id=:'other_org'),'demo reset leaves other organization untouched');
select pg_temp.assert_true((select count(*)>=7 from audit_events where organization_id=:'org'),'administration audited');
select 'PASS: onboarding';
rollback;
