-- Supabase grants function EXECUTE to anon/authenticated/service_role through default ACLs.
-- Revoking PUBLIC alone does not revoke those explicit grants. Lock down only Alvis functions.
do $$
declare fn record; client_names text[]:=array[
 'alvis_role','alvis_worker_unit_visible','alvis_transition','alvis_copy_draft','alvis_review_summaries',
 'alvis_new_capture','alvis_begin_capture','alvis_capture_command','alvis_is_active','alvis_vector_dimensions','alvis_hybrid_search',
 'alvis_learning_command','alvis_reserve_ask','alvis_record_answer','alvis_learning_history',
 'alvis_create_organization','alvis_invitation','alvis_accept_invitation','alvis_admin_command',
 'alvis_invitation_delivery','alvis_withdraw_capture','alvis_demo_reset'];
 worker_names text[]:=array['alvis_claim_job','alvis_claim_learning_job','alvis_heartbeat','alvis_fail_job',
 'alvis_finish_job','alvis_finish_index','alvis_finish_lesson','alvis_is_active','alvis_vector_dimensions','alvis_content_hash','alvis_function_permissions'];
begin
 for fn in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (left(p.proname,6)='alvis_' or p.proname in ('protect_reviewed_content','protect_reviewed_lesson')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  if fn.proname=any(client_names) then execute format('grant execute on function %s to authenticated',fn.signature); end if;
  if fn.proname=any(worker_names) then execute format('grant execute on function %s to service_role',fn.signature); end if;
 end loop;
end $$;
notify pgrst,'reload schema';
