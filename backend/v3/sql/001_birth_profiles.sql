-- Run once in the V3-only Supabase project's SQL Editor.
-- No existing tables are dropped. Only verified users can access their own row.
begin;
create table public.v3_birth_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 16384),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.v3_birth_profiles enable row level security;
alter table public.v3_birth_profiles force row level security;
revoke all on public.v3_birth_profiles from public, anon, authenticated;
grant select on public.v3_birth_profiles to authenticated;
grant insert (user_id, profile) on public.v3_birth_profiles to authenticated;
grant update (profile) on public.v3_birth_profiles to authenticated;

create policy "read own birth profile" on public.v3_birth_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own birth profile" on public.v3_birth_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own birth profile" on public.v3_birth_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.v3_profile_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.v3_profile_revision() from public, anon, authenticated;
create trigger v3_profile_revision before update on public.v3_birth_profiles
  for each row execute function public.v3_profile_revision();
commit;
