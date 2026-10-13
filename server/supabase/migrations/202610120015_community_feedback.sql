create function public.alvis_community_feedback() returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('publication_id',v.publication_id,'reviewer_id',v.reviewer_id,'decision',v.decision,'reason',v.reason,'content_hash',v.content_hash,'created_at',v.created_at)),'[]')
 from community_reviews v join community_publications p on p.id=v.publication_id
 where p.author_id=auth.uid() or (v.reviewer_id=auth.uid() and exists(select 1 from community_profiles cp where cp.user_id=auth.uid() and cp.role='reviewer'))
$$;
revoke all on function public.alvis_community_feedback() from public,anon,authenticated,service_role;
grant execute on function public.alvis_community_feedback() to authenticated;
-- Public RPC access is narrowly limited to the read-only library and visibility gate.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('alvis_function_permissions()'::regprocedure);
 definition:=replace(definition,'has_function_privilege(''anon'',p.oid,''EXECUTE'')','(p.proname not in (''alvis_public_library'',''alvis_community_visible'') and has_function_privilege(''anon'',p.oid,''EXECUTE''))');
 execute definition;
end $$;
notify pgrst,'reload schema';
