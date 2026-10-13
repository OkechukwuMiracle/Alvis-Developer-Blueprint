-- Preserve prior draft snapshots without giving workers access to draft history.
create table draft_edit_history (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, revision_id uuid not null,
 content jsonb not null, content_hash text not null, actor_id uuid, saved_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,revision_id) references knowledge_revisions(organization_id,id),
 foreign key(organization_id,actor_id) references memberships(organization_id,user_id)
);
alter table draft_edit_history enable row level security;
create policy draft_history_read on draft_edit_history for select to authenticated using(
 alvis_role(organization_id) in ('admin','reviewer') or
 (alvis_role(organization_id)='expert' and exists(select 1 from knowledge_revisions r where r.id=revision_id and r.organization_id=draft_edit_history.organization_id and r.created_by=auth.uid()))
);
grant select on draft_edit_history to authenticated;
grant all on draft_edit_history to service_role;
revoke all on draft_edit_history from anon;
create function alvis_snapshot_draft() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 insert into draft_edit_history(organization_id,revision_id,content,content_hash,actor_id)
 values(old.organization_id,old.id,old.content,old.content_hash,auth.uid());
 return new;
end $$;
revoke all on function alvis_snapshot_draft() from public;
create trigger snapshot_draft before update of content on knowledge_revisions
 for each row when(old.status='draft' and old.content is distinct from new.content) execute function alvis_snapshot_draft();
