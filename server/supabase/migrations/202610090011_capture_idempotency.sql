create table capture_creation_requests (
 user_id uuid not null references auth.users(id), request_id uuid not null, organization_id uuid not null,
 capture_id uuid not null, recording_hash text not null check(recording_hash ~ '^[a-f0-9]{64}$'),
 primary key(user_id,request_id), foreign key(organization_id,capture_id) references captures(organization_id,id)
);
alter table capture_creation_requests enable row level security;
revoke all on capture_creation_requests from anon,authenticated;
create function alvis_begin_capture(asset uuid,title text,task text,consent text,request_id uuid,recording_hash text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a assets; previous capture_creation_requests; c captures; capture uuid;
begin
 select * into a from assets where id=asset and alvis_role(organization_id)='expert';
 if not found or request_id is null or recording_hash is null or recording_hash !~ '^[a-f0-9]{64}$' then raise exception 'Capture request unavailable'; end if;
 perform 1 from memberships where organization_id=a.organization_id and user_id=auth.uid() for update;
 if alvis_role(a.organization_id) is distinct from 'expert' then raise exception 'Expert required'; end if;
 select * into previous from capture_creation_requests where user_id=auth.uid() and capture_creation_requests.request_id=alvis_begin_capture.request_id;
 if found then
  select * into c from captures where id=previous.capture_id and organization_id=a.organization_id and owner_id=auth.uid();
  if not found or previous.recording_hash<>recording_hash or c.asset_id<>asset or c.title<>trim(title) or c.task<>trim(task) or c.consent_version<>consent or c.state='deleted' then raise exception 'Capture request changed; start a new recording'; end if;
  return c.id;
 end if;
 capture:=alvis_new_capture(asset,trim(title),trim(task),consent);
 insert into capture_creation_requests values(auth.uid(),request_id,a.organization_id,capture,recording_hash);
 return capture;
end $$;
revoke all on function alvis_begin_capture(uuid,text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function alvis_begin_capture(uuid,text,text,text,uuid,text) to authenticated;
