-- Read-only operator check; never test ACLs by invoking a live claim/finish RPC.
create function alvis_function_permissions() returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and left(p.proname,6)='alvis_' and
  (has_function_privilege('anon',p.oid,'EXECUTE') or
   (p.proname in ('alvis_claim_job','alvis_claim_learning_job','alvis_heartbeat','alvis_fail_job','alvis_finish_job','alvis_finish_index','alvis_finish_lesson','alvis_function_permissions') and has_function_privilege('authenticated',p.oid,'EXECUTE')) or
   (p.proname in ('alvis_transition','alvis_copy_draft','alvis_learning_command','alvis_admin_command','alvis_create_organization','alvis_accept_invitation','alvis_begin_capture') and has_function_privilege('service_role',p.oid,'EXECUTE')))
 )
$$;
revoke all on function alvis_function_permissions() from public,anon,authenticated,service_role;
grant execute on function alvis_function_permissions() to service_role;
notify pgrst,'reload schema';
