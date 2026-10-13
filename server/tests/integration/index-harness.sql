-- Isolated SQL-test vectors, NOT model embeddings or a live model evaluation.
create function pg_temp.flush_indexes() returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare j processing_jobs; r knowledge_revisions; begin
 if to_regprocedure('alvis_finish_index(uuid,uuid,jsonb,text)') is null then return; end if;
 for j in select * from processing_jobs where stage='index' and status='queued' loop
  select * into r from knowledge_revisions where id=j.revision_id;
  update processing_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=j.id returning * into j;
  perform alvis_finish_index(j.id,j.lease_token,jsonb_build_array(jsonb_build_object('ordinal',0,'text',r.content->>'title','evidence_ids',jsonb_path_query_array(r.content,'$.**.evidence_ids[*]'),'embedding',jsonb_build_array(1)||to_jsonb(array_fill(0,array[1535])))),'sql-test-only');
 end loop;
end $$;
