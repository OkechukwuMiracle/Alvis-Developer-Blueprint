-- Queue metadata is visible to eligible reviewers; supporting excerpts require assignment.
drop policy publication_read on public.community_publications;
create policy publication_read on public.community_publications for select using
 (alvis_community_visible(id) or author_id=auth.uid() or (state='pending' and assigned_reviewer=auth.uid()
 and author_id<>auth.uid() and exists(select 1 from community_profiles p where p.user_id=auth.uid() and p.role='reviewer')));
create function public.alvis_community_queue() returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 perform alvis_verified_email();
 if not exists(select 1 from community_profiles where user_id=auth.uid() and role='reviewer') then raise exception 'ALVIS: Community reviewer required'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision_id',p.revision_id,'author_id',p.author_id,
 'content',case when p.assigned_reviewer=auth.uid() then p.content else jsonb_build_object('title',p.content->>'title') end,
 'content_hash',p.content_hash,'excerpts',case when p.assigned_reviewer=auth.uid() then p.excerpts else '[]'::jsonb end,
 'topic',p.topic,'equipment',p.equipment,'assigned_reviewer',p.assigned_reviewer)),'[]') from
 (select cp.* from community_publications cp join organizations o on o.id=cp.scope_id and o.scope_kind='personal' and o.personal_owner=cp.author_id
 where cp.state='pending' and cp.audience='community_public' and cp.author_id<>auth.uid()
 and (cp.assigned_reviewer is null or cp.assigned_reviewer=auth.uid()) order by cp.created_at limit 50) p);
end $$;

-- Reserve rate-limit capacity before provider work, including failures and concurrent requests.
create table public.community_question_requests(user_id uuid not null references public.community_profiles(user_id),created_at timestamptz not null default now());
create index community_question_rate on public.community_question_requests(user_id,created_at);
alter table public.community_question_requests enable row level security;
revoke all on public.community_question_requests from anon,authenticated;
create function public.alvis_reserve_community_question(question text) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 perform alvis_verified_email();
 if not exists(select 1 from community_profiles where user_id=auth.uid()) or coalesce(length(trim(question)),0) not between 3 and 1000 then raise exception 'ALVIS: Invalid personal question'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,77));
 if (select count(*) from community_question_requests where user_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'ALVIS: Question rate limit. Wait a minute and try again'; end if;
 insert into community_question_requests(user_id) values(auth.uid());
end $$;

-- Preserve the citation gate while rejecting malformed direct RPC submissions.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.alvis_community_record_answer(text,jsonb,uuid[])'::regprocedure);
 definition:=replace(definition,'perform alvis_verified_email();',$guard$perform alvis_verified_email();
 if response is null or revisions is null or jsonb_typeof(response) is distinct from 'object'
 or response->>'mode' is null or response->>'mode' not in ('answer','clarify','abstain','escalate')
 or jsonb_typeof(response->'summary') is distinct from 'string' or coalesce(length(trim(response->>'summary')),0) not between 1 and 6000
 or jsonb_typeof(response->'claims') is distinct from 'array' then raise exception 'ALVIS: Invalid answer shape'; end if;
 if (response-array['mode','summary','claims','clarifying_question','escalation_reason'])<>'{}'::jsonb
 or not (response ?& array['mode','summary','claims','clarifying_question','escalation_reason'])
 or jsonb_array_length(response->'claims')>10
 or (response->>'mode'<>'answer' and jsonb_array_length(response->'claims')<>0)
 or (response->>'mode'='answer' and jsonb_array_length(response->'claims')=0)
 or (response->>'mode'='clarify' and coalesce(length(trim(response->>'clarifying_question')),0)=0)
 or (response->>'mode'='escalate' and coalesce(length(trim(response->>'escalation_reason')),0)=0)
 then raise exception 'ALVIS: Invalid answer mode'; end if;
 for claim in select value from jsonb_array_elements(response->'claims') loop
 if jsonb_typeof(claim) is distinct from 'object' or jsonb_typeof(claim->'text') is distinct from 'string'
 or coalesce(length(trim(claim->>'text')),0) not between 1 and 3000 or claim->>'revision_id' is null
 or (claim-array['text','revision_id','evidence_ids'])<>'{}'::jsonb then raise exception 'ALVIS: Invalid answer claim'; end if;
 end loop;
 $guard$);
 execute definition;
end $$;
revoke all on function public.alvis_community_queue(),public.alvis_reserve_community_question(text) from public,anon,authenticated,service_role;
grant execute on function public.alvis_community_queue(),public.alvis_reserve_community_question(text) to authenticated;
notify pgrst,'reload schema';
