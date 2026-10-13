-- Public signup grants no organization access. Only these verified-user transactions do.
alter table public.memberships add column revoked_at timestamptz;
create or replace function public.alvis_role(org uuid) returns public.member_role
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select role from public.memberships where organization_id=org and user_id=auth.uid() and revoked_at is null
$$;
create table public.organization_creations (
 user_id uuid not null references auth.users(id), request_id uuid not null,
 organization_id uuid not null references public.organizations(id), primary key(user_id,request_id)
);
create table public.member_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null check(email=lower(trim(email)) and length(email)<=254),
 role public.member_role not null check(role in ('expert','reviewer','worker')),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), request_id uuid not null,
 invited_by uuid not null, expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, accepted_by uuid references auth.users(id), revoked_at timestamptz,
 created_at timestamptz not null default now(), unique(organization_id,request_id),
 foreign key(organization_id,invited_by) references public.memberships(organization_id,user_id)
);
create unique index one_pending_invitation on public.member_invitations(organization_id,email)
 where accepted_at is null and revoked_at is null;
alter table public.member_invitations enable row level security;
alter table public.organization_creations enable row level security;
revoke all on public.member_invitations,public.organization_creations from anon,authenticated;
grant select(id,organization_id,email,role,expires_at,accepted_at,revoked_at,created_at) on public.member_invitations to authenticated;
create policy invitation_admin_read on public.member_invitations for select to authenticated using(public.alvis_role(organization_id)='admin');

create function public.alvis_verified_email() returns text language plpgsql stable security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare address text;
begin
 select lower(trim(email)) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if address is null then raise exception 'Verified email required'; end if;
 return address;
end $$;
revoke all on function public.alvis_verified_email() from public;

create function public.alvis_create_organization(org_name text, person_name text, request_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare org uuid;
begin
 perform public.alvis_verified_email();
 if request_id is null or length(trim(org_name)) not between 2 and 100 or length(trim(person_name)) not between 2 and 100 then raise exception 'Invalid organization details'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select organization_id into org from public.organization_creations c where c.user_id=auth.uid() and c.request_id=alvis_create_organization.request_id;
 if org is not null then return org; end if;
 if exists(select 1 from public.memberships where user_id=auth.uid() and revoked_at is null) then raise exception 'Use your existing workspace'; end if;
 insert into public.organizations(name,demo_only) values(trim(org_name),false) returning id into org;
 insert into public.memberships(organization_id,user_id,role,display_name) values(org,auth.uid(),'admin',trim(person_name));
 insert into public.sites(organization_id,name) values(org,'Training workspace');
 insert into public.organization_creations values(auth.uid(),request_id,org);
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id) values(org,auth.uid(),'organization_created','organization',org);
 return org;
end $$;

create function public.alvis_invitation(org uuid, operation text, payload jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare invitation public.member_invitations; address text; target_role public.member_role; new_hash text; rid uuid;
begin
 perform public.alvis_verified_email();
 if public.alvis_role(org) is distinct from 'admin' then raise exception 'Administrator required'; end if;
 -- Serialize invites, resends and membership changes for this workspace.
 perform 1 from public.organizations where id=org for update;
 if public.alvis_role(org) is distinct from 'admin' then raise exception 'Administrator required'; end if;
 if operation='create' then
  address:=lower(trim(payload->>'email')); target_role:=(payload->>'role')::public.member_role; rid:=(payload->>'request_id')::uuid;
  if address is null or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or target_role not in ('expert','reviewer','worker') or rid is null then raise exception 'Invalid invitation'; end if;
  select * into invitation from public.member_invitations where organization_id=org and request_id=rid;
  if found then return invitation.id; end if;
  update public.member_invitations set revoked_at=now() where organization_id=org and email=address and accepted_at is null and revoked_at is null and expires_at<=now();
  if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id where m.organization_id=org and m.revoked_at is null and lower(u.email)=address) then raise exception 'Already a member'; end if;
  new_hash:=payload->>'token_hash';
  insert into public.member_invitations(organization_id,email,role,token_hash,request_id,invited_by) values(org,address,target_role,new_hash,rid,auth.uid()) returning * into invitation;
 elsif operation in ('revoke','resend') then
  select * into invitation from public.member_invitations where organization_id=org and id=(payload->>'id')::uuid for update;
  if not found or invitation.accepted_at is not null or invitation.revoked_at is not null then raise exception 'Invitation unavailable'; end if;
  if operation='revoke' then update public.member_invitations set revoked_at=now() where id=invitation.id;
  else update public.member_invitations set token_hash=payload->>'token_hash', expires_at=now()+interval '7 days' where id=invitation.id; end if;
 else raise exception 'Invalid operation'; end if;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id) values(org,auth.uid(),'invitation_'||operation,'invitation',invitation.id);
 return invitation.id;
end $$;

create function public.alvis_accept_invitation(token_hash text, person_name text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare invitation public.member_invitations; address text;
begin
 address:=public.alvis_verified_email();
 if length(trim(person_name)) not between 2 and 100 then raise exception 'Name required'; end if;
 select * into invitation from public.member_invitations i where i.token_hash=alvis_accept_invitation.token_hash for update;
 if not found or invitation.email<>address or invitation.revoked_at is not null then raise exception 'Invitation unavailable'; end if;
 if invitation.accepted_at is not null then
  if invitation.accepted_by=auth.uid() and public.alvis_role(invitation.organization_id) is not null then return invitation.organization_id; end if;
  raise exception 'Invitation unavailable';
 end if;
 if invitation.expires_at<=now() then raise exception 'Invitation unavailable'; end if;
 -- Existing members keep their current role. Revoked membership needs a fresh authorized invitation.
 insert into public.memberships(organization_id,user_id,role,display_name) values(invitation.organization_id,auth.uid(),invitation.role,trim(person_name))
 on conflict(organization_id,user_id) do update set revoked_at=null,role=case when memberships.revoked_at is not null then excluded.role else memberships.role end;
 update public.member_invitations set accepted_at=now(),accepted_by=auth.uid() where id=invitation.id;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id) values(invitation.organization_id,auth.uid(),'invitation_accepted','invitation',invitation.id);
 return invitation.organization_id;
end $$;

create function public.alvis_admin_command(org uuid, operation text, payload jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare target uuid; selected_role public.member_role; site uuid;
begin
 perform public.alvis_verified_email();
 if public.alvis_role(org) is distinct from 'admin' then raise exception 'Administrator required'; end if;
 perform 1 from public.organizations where id=org for update;
 if public.alvis_role(org) is distinct from 'admin' then raise exception 'Administrator required'; end if;
 if operation='asset' then
  if length(trim(payload->>'code')) not between 1 and 40 or length(trim(payload->>'name')) not between 2 and 100 then raise exception 'Invalid asset'; end if;
  select id into site from public.sites where organization_id=org order by id limit 1;
  insert into public.assets(organization_id,site_id,code,name,simulation_only) values(org,site,trim(payload->>'code'),trim(payload->>'name'),true)
  on conflict(organization_id,code) do nothing returning id into target;
  if target is null then select id into target from public.assets where organization_id=org and code=trim(payload->>'code'); end if;
 elsif operation in ('role','remove') then
  target:=(payload->>'user_id')::uuid; selected_role:=(payload->>'role')::public.member_role;
  if target=auth.uid() then raise exception 'Ask another administrator to change your membership'; end if;
  if not exists(select 1 from public.memberships where organization_id=org and user_id=target and revoked_at is null) then raise exception 'Member unavailable'; end if;
  if operation='remove' then update public.memberships set revoked_at=now() where organization_id=org and user_id=target;
  else
   if selected_role is null then raise exception 'Role required'; end if;
   update public.memberships set role=selected_role where organization_id=org and user_id=target;
  end if;
 else raise exception 'Invalid operation'; end if;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org,auth.uid(),'admin_'||operation,case when operation='asset' then 'asset' else 'membership' end,target,jsonb_build_object('role',selected_role));
 return target;
end $$;

revoke all on function public.alvis_create_organization(text,text,uuid),public.alvis_invitation(uuid,text,jsonb),public.alvis_accept_invitation(text,text),public.alvis_admin_command(uuid,text,jsonb) from public;
grant execute on function public.alvis_create_organization(text,text,uuid),public.alvis_invitation(uuid,text,jsonb),public.alvis_accept_invitation(text,text),public.alvis_admin_command(uuid,text,jsonb) to authenticated;

-- Column grants keep hashes unreadable. An administrator can resolve the delivery email only for the token just issued.
create function public.alvis_invitation_delivery(org uuid,invitation_id uuid,expected_hash text) returns text
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if public.alvis_role(org) is distinct from 'admin' then raise exception 'Administrator required'; end if;
 return (select email from public.member_invitations where organization_id=org and id=invitation_id and token_hash=expected_hash and accepted_at is null and revoked_at is null and expires_at>now());
end $$;
revoke all on function public.alvis_invitation_delivery(uuid,uuid,text) from public;
grant execute on function public.alvis_invitation_delivery(uuid,uuid,text) to authenticated;
