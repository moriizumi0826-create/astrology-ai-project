-- Apply to V3 Supabase before enabling the new chat backend. No chat text is stored.
begin;
create table public.v3_map_chat_usage (
  token uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  succeeded boolean not null default false,
  expires_at timestamptz not null
);
create index v3_map_chat_usage_user_date on public.v3_map_chat_usage(user_id,usage_date);
alter table public.v3_map_chat_usage enable row level security;
alter table public.v3_map_chat_usage force row level security;
revoke all on public.v3_map_chat_usage from public,anon,authenticated;
grant all on public.v3_map_chat_usage to service_role;

create function public.v3_map_chat_quota(p_user_id uuid,p_action text,p_token uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  now_at timestamptz; used_count integer; held_count integer; outcome text := null;
  reservation public.v3_map_chat_usage;
begin
  if p_limit is null or p_action is null or p_limit<1 or p_limit>1000 or p_action not in ('status','reserve','success','failure') then
    raise exception 'invalid quota request';
  end if;
  -- Serialize every action per account across workers/tabs/devices.
  perform 1 from auth.users where id=p_user_id for update;
  if not found then return jsonb_build_object('error','missing_user'); end if;
  now_at := clock_timestamp();
  today := (now_at at time zone 'Asia/Tokyo')::date;
  delete from public.v3_map_chat_usage where user_id=p_user_id and
    (usage_date<today-30 or (not succeeded and expires_at<=now_at));
  if p_action in ('success','failure') then
    select * into reservation from public.v3_map_chat_usage where token=p_token and user_id=p_user_id;
    if not found then outcome := 'expired';
    elsif p_action='success' then
      update public.v3_map_chat_usage set succeeded=true where token=p_token;
    elsif not reservation.succeeded then
      delete from public.v3_map_chat_usage where token=p_token;
    end if;
  end if;
  select count(*) filter(where succeeded),count(*) filter(where not succeeded)
    into used_count,held_count from public.v3_map_chat_usage where user_id=p_user_id and usage_date=today;
  if p_action='reserve' then
    if p_token is null then raise exception 'missing token'; end if;
    if used_count+held_count>=p_limit then outcome := 'limit';
    else
      insert into public.v3_map_chat_usage(token,user_id,usage_date,expires_at)
        values(p_token,p_user_id,today,now_at+interval '10 minutes');
      held_count := held_count+1;
    end if;
  end if;
  return jsonb_build_object('error',outcome,'limit',p_limit,'used',used_count,'reserved',held_count,
    'remaining',greatest(0,p_limit-used_count-held_count),'date',today,
    'reset_at',((today+1)::timestamp at time zone 'Asia/Tokyo'));
end $$;
revoke all on function public.v3_map_chat_quota(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.v3_map_chat_quota(uuid,text,uuid,integer) to service_role;
commit;
