-- Run immediately after 008, before accepting notes. All test writes roll back.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $$
declare owner_id uuid; result jsonb; note_id uuid;
begin
  if exists(select 1 from public.v3_calendar_notes) then
    raise exception 'Verification requires an empty notes table';
  end if;
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then raise exception 'No account available for transactional verification'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  for i in 1..100 loop
    result := public.v3_save_calendar_note(owner_id,null,current_date,'transactional verification',null);
    if not result ? 'saved' then raise exception 'Save failed'; end if;
  end loop;
  result := public.v3_save_calendar_note(owner_id,null,current_date,'overflow',null);
  if result->>'error' is distinct from 'limit' then raise exception 'Limit not enforced'; end if;
  select id into note_id from public.v3_calendar_notes where user_id=owner_id limit 1;
  result := public.v3_save_calendar_note(owner_id,note_id,current_date,repeat('文',1000),1);
  if result->'saved'->>'revision' is distinct from '2' then raise exception 'Update failed'; end if;
  result := public.v3_save_calendar_note(owner_id,note_id,current_date,'stale',1);
  if result->>'error' is distinct from 'conflict' then raise exception 'Revision not enforced'; end if;
  begin
    perform public.v3_save_calendar_note(owner_id,note_id,current_date,repeat('文',1001),2);
    raise exception 'Length not enforced';
  exception when check_violation then null;
  end;
end;
$$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.v3_calendar_notes) <> 100 then raise exception 'Owner read failed'; end if;
  if has_table_privilege('authenticated','public.v3_calendar_notes','INSERT')
     or has_table_privilege('authenticated','public.v3_calendar_notes','UPDATE')
     or has_function_privilege('authenticated','public.v3_save_calendar_note(uuid,uuid,date,text,integer)','EXECUTE')
  then raise exception 'Direct writes exposed'; end if;
end; $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000';
do $$ begin
  if exists(select 1 from public.v3_calendar_notes) then raise exception 'Other user can read notes'; end if;
  delete from public.v3_calendar_notes;
  if found then raise exception 'Other user can delete notes'; end if;
end; $$;
reset role;
rollback;
select 'PASS: quota, length, revision, RLS and permissions; test writes rolled back' as result;
