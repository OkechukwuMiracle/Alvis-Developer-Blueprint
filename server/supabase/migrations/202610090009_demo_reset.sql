-- Preserve users, memberships, assets, historical assessments and audit records.
-- Reset only invalidates knowledge/evidence in an explicitly designated demo organization.
create function alvis_demo_reset(org uuid,confirmation uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform public.alvis_verified_email();
 if org is distinct from confirmation or alvis_role(org) is distinct from 'admin' then raise exception 'Explicit demo administrator confirmation required'; end if;
 perform 1 from organizations where id=org and demo_only=true for update;
 if not found then raise exception 'Reset is restricted to a designated demo workspace'; end if;
 update knowledge_revisions set status='retired',index_ready=false where organization_id=org and status<>'retired';
 update knowledge_units set active_revision_id=null where organization_id=org;
 update sources set withdrawn_at=now() where organization_id=org and withdrawn_at is null;
 update captures set state='deleted' where organization_id=org and state<>'deleted';
 update processing_jobs set status='cancelled',lease_token=null,lease_until=null where organization_id=org and status in ('queued','running');
 update member_invitations set revoked_at=now() where organization_id=org and accepted_at is null and revoked_at is null;
 insert into audit_events(organization_id,actor_id,action,entity_type,entity_id) values(org,auth.uid(),'demo_reset','organization',org);
end $$;
revoke all on function alvis_demo_reset(uuid,uuid) from public;
grant execute on function alvis_demo_reset(uuid,uuid) to authenticated;
