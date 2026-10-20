-- Anonymous browser/day counts; apply once in the production SQL Editor.
begin;
create table public.v3_daily_visitors (
  visit_date date not null,
  visitor_id uuid not null,
  primary key (visit_date, visitor_id)
);
alter table public.v3_daily_visitors enable row level security;
alter table public.v3_daily_visitors force row level security;
revoke all on public.v3_daily_visitors from public, anon, authenticated;
grant select, insert on public.v3_daily_visitors to service_role;

create function public.v3_record_visit(p_visitor_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.v3_daily_visitors(visit_date, visitor_id)
  values ((clock_timestamp() at time zone 'Asia/Tokyo')::date, p_visitor_id)
  on conflict do nothing;
$$;
revoke all on function public.v3_record_visit(uuid) from public, anon, authenticated;
grant execute on function public.v3_record_visit(uuid) to service_role;
commit;
