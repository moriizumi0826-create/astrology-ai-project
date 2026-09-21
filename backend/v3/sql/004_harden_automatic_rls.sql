-- Run once when Supabase automatic RLS was enabled during project creation.
-- The event trigger can continue using this helper; browser roles must not call it.
begin;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
