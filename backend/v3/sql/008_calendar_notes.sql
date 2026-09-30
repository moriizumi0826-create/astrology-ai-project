-- Apply to the V3 Supabase project only. No existing data is removed.
begin;
create table public.v3_calendar_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 100),
  note_date date not null,
  content text not null check (char_length(content) between 1 and 1000 and length(btrim(content)) > 0),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  unique(user_id, slot)
);
alter table public.v3_calendar_notes enable row level security;
alter table public.v3_calendar_notes force row level security;
revoke all on public.v3_calendar_notes from public, anon, authenticated;
grant select, delete on public.v3_calendar_notes to authenticated;
grant all on public.v3_calendar_notes to service_role;
create policy "read own calendar notes" on public.v3_calendar_notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "delete own calendar notes" on public.v3_calendar_notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Only the server can write, after checking current paid/invite/owner access.
-- Serialize writes for this owner; slots also make >100 rows impossible.
create function public.v3_save_calendar_note(p_user_id uuid, p_id uuid,
  p_date date, p_content text, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved public.v3_calendar_notes; free_slot smallint;
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found then return jsonb_build_object('error','missing_user'); end if;
  if p_id is null then
    select n::smallint into free_slot from generate_series(1,100) n
      where not exists (select 1 from public.v3_calendar_notes where user_id=p_user_id and slot=n)
      order by n limit 1;
    if free_slot is null then return jsonb_build_object('error','limit'); end if;
    insert into public.v3_calendar_notes(user_id,slot,note_date,content)
      values(p_user_id,free_slot,p_date,p_content) returning * into saved;
  else
    update public.v3_calendar_notes set note_date=p_date,content=p_content,
      revision=revision+1,updated_at=now()
      where id=p_id and user_id=p_user_id and revision=p_revision returning * into saved;
    if not found then return jsonb_build_object('error','conflict'); end if;
  end if;
  return jsonb_build_object('saved',to_jsonb(saved)-'user_id'-'slot');
end;
$$;
revoke all on function public.v3_save_calendar_note(uuid,uuid,date,text,integer) from public,anon,authenticated;
grant execute on function public.v3_save_calendar_note(uuid,uuid,date,text,integer) to service_role;
commit;
