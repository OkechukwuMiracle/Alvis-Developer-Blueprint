-- An internal personal storage membership must not prevent later organization onboarding.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.alvis_create_organization(text,text,uuid)'::regprocedure);
 definition:=replace(definition,
 'exists(select 1 from public.memberships where user_id=auth.uid() and revoked_at is null)',
 'exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() and m.revoked_at is null and o.scope_kind=''organization'')');
 execute definition;
end $$;
grant select on public.community_publications to service_role;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.alvis_organization_transition(uuid,text,jsonb,text,text,text)'::regprocedure);
 execute replace(definition,'alvis_transition.','alvis_organization_transition.');
end $$;
notify pgrst,'reload schema';
