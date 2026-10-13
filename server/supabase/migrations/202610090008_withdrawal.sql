alter table sources add column withdrawn_at timestamptz;
create or replace function alvis_immutable_source() returns trigger language plpgsql as $$
begin
 if (to_jsonb(new)-'withdrawn_at') is distinct from (to_jsonb(old)-'withdrawn_at') or old.withdrawn_at is not null or new.withdrawn_at is null then
  raise exception 'ALVIS: Evidence is immutable; append a source version';
 end if;
 return new;
end $$;
create policy source_not_withdrawn on sources as restrictive for select to authenticated using(withdrawn_at is null);
-- Validation is SECURITY DEFINER: explicitly exclude withdrawn evidence even when RLS is bypassed.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('alvis_validate_content(jsonb,uuid,uuid,boolean)'::regprocedure);
 definition:=replace(definition,'rs.source_id::text=evidence)', 'rs.source_id::text=evidence and s.withdrawn_at is null)');
 execute definition;
end $$;
create function alvis_withdraw_capture(org uuid,capture uuid,confirmation text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c captures; r knowledge_revisions;
begin
 select * into c from captures where organization_id=org and id=capture for update;
 if not found or (alvis_role(org)='admin' or (alvis_role(org)='expert' and c.owner_id=auth.uid())) is not true then raise exception 'Capture unavailable'; end if;
 if confirmation is distinct from c.title then raise exception 'Confirm the exact recording title'; end if;
 if c.state='deleted' then return c.id; end if;
 -- Lock every dependent revision; retirement triggers invalidate guides, cancel indexing and remove chunks.
 for r in select distinct kr.* from knowledge_revisions kr join revision_sources rs on rs.organization_id=kr.organization_id and rs.revision_id=kr.id join sources s on s.organization_id=rs.organization_id and s.id=rs.source_id where kr.organization_id=org and s.capture_id=c.id order by kr.id loop
  perform 1 from knowledge_revisions where id=r.id and organization_id=org for update;
  update knowledge_revisions set status='retired',index_ready=false where id=r.id and organization_id=org and status<>'retired';
  update knowledge_units set active_revision_id=null where organization_id=org and active_revision_id=r.id;
 end loop;
 update sources set withdrawn_at=now() where organization_id=org and capture_id=c.id and withdrawn_at is null;
 update processing_jobs set status='cancelled',lease_token=null,lease_until=null where organization_id=org and capture_id=c.id and status in ('queued','running');
 update captures set state='deleted' where organization_id=org and id=c.id;
 insert into audit_events(organization_id,actor_id,action,entity_type,entity_id) values(org,auth.uid(),'evidence_withdrawn','capture',c.id);
 return c.id;
end $$;
revoke all on function alvis_withdraw_capture(uuid,uuid,text) from public;
grant execute on function alvis_withdraw_capture(uuid,uuid,text) to authenticated;
