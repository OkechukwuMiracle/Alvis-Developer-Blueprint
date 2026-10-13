-- Deferred embedding schema. Apply only in the embedding milestone.
create extension if not exists vector;
create table public.knowledge_chunks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 revision_id uuid not null, ordinal integer not null, text_content text not null,
 embedding vector(1536) not null,
 search_terms tsvector generated always as (to_tsvector('english',text_content)) stored,
 foreign key(organization_id,revision_id) references public.knowledge_revisions(organization_id,id),
 unique(revision_id,ordinal), unique(organization_id,id)
);
create index chunks_keyword on public.knowledge_chunks using gin(search_terms);
alter table public.knowledge_chunks enable row level security;
create policy chunk_read on public.knowledge_chunks for select to authenticated
 using(exists(select 1 from public.knowledge_revisions r join public.knowledge_units u
 on u.active_revision_id=r.id where r.id=revision_id and r.status='approved' and r.index_ready));
revoke all on public.knowledge_chunks from anon;
revoke insert,update,delete on public.knowledge_chunks from authenticated;
grant select on public.knowledge_chunks to authenticated;
