begin;
create policy permissive_test_only on storage.objects for all to authenticated using(true) with check(true);
insert into storage.objects(bucket_id,name) values('alvis-recordings','private-evidence'),('other-bucket','existing-general-file');
set local role authenticated;
do $$ begin
 if (select count(*) from storage.objects where bucket_id='alvis-recordings')<>0 then raise exception 'Private recording policy leaked objects'; end if;
 if (select count(*) from storage.objects where bucket_id='other-bucket')<>1 then raise exception 'Other bucket access was changed'; end if;
 begin insert into storage.objects(bucket_id,name) values('alvis-recordings','worker-write'); raise exception 'Recording write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin if (select count(*) from storage.objects where bucket_id='alvis-recordings')<>1 then raise exception 'Server media authority unavailable'; end if; end $$;
reset role;
rollback;
select 'PASS: restrictive Storage policy denies direct client access despite broad existing policy';
