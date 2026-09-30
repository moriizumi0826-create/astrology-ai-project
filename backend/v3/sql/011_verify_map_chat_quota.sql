-- Run immediately after 010, before chat traffic is enabled.
-- No chat/API call, no account changes. All temporary usage rows are rolled back.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $$
declare
  uid uuid; first_token uuid := gen_random_uuid(); second_token uuid := gen_random_uuid();
  result jsonb; i integer;
begin
  if exists(select 1 from public.v3_map_chat_usage) then
    raise exception 'Verification requires the newly created empty usage table';
  end if;
  if not exists(select 1 from pg_class where oid='public.v3_map_chat_usage'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'RLS not enforced';
  end if;
  if has_table_privilege('anon','public.v3_map_chat_usage','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.v3_map_chat_usage','SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('anon','public.v3_map_chat_quota(uuid,text,uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.v3_map_chat_quota(uuid,text,uuid,integer)','EXECUTE') then
    raise exception 'Public quota access must be denied';
  end if;
  if not has_function_privilege('service_role','public.v3_map_chat_quota(uuid,text,uuid,integer)','EXECUTE') then
    raise exception 'Backend RPC permission missing';
  end if;
  select id into uid from auth.users order by id limit 1;
  if uid is null then raise exception 'No account available for rollback-only verification'; end if;
  result := public.v3_map_chat_quota(uid,'status',null,20);
  if (result->>'remaining')::integer<>20 then raise exception 'Initial quota mismatch'; end if;
  perform public.v3_map_chat_quota(uid,'reserve',first_token,20);
  perform public.v3_map_chat_quota(uid,'reserve',second_token,20);
  for i in 3..20 loop perform public.v3_map_chat_quota(uid,'reserve',gen_random_uuid(),20); end loop;
  result := public.v3_map_chat_quota(uid,'reserve',gen_random_uuid(),20);
  if result->>'error' is distinct from 'limit' then raise exception '21st request was not blocked'; end if;
  perform public.v3_map_chat_quota(uid,'success',first_token,20);
  perform public.v3_map_chat_quota(uid,'success',first_token,20);
  perform public.v3_map_chat_quota(uid,'failure',first_token,20);
  result := public.v3_map_chat_quota(uid,'failure',second_token,20);
  if (result->>'used')::integer<>1 or (result->>'remaining')::integer<>1 then
    raise exception 'Commit idempotency or failed-request release incorrect';
  end if;
end $$;
rollback;
select 'OK: quota boundary, successful count, failure release and access controls' as verification,
  (select count(*) from public.v3_map_chat_usage) as persisted_usage_rows;
