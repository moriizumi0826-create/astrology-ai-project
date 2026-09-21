-- Allow an authenticated member to delete only their own saved birth profile.
begin;

grant delete on public.v3_birth_profiles to authenticated;

create policy "delete own birth profile" on public.v3_birth_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

commit;
