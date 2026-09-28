-- Read-only verification after 006_invites_and_trials.sql. Every row must be OK.
begin read only;

with checks(name, passed) as (
  values
    ('campaign configuration exists and is inactive', (
      select count(*) = 1 and bool_and(not enabled and starts_at is null
        and max_automatic_grants = 25 and automatic_grants_used = 0
        and ends_at = '2026-11-01 00:00:00+09'::timestamptz)
      from public.v3_invite_campaign)),
    ('invite and trial tables exist', not exists (
      select 1 from (values ('v3_invite_campaign'), ('v3_invite_grants'),
        ('v3_trial_cards'), ('v3_trial_users'), ('v3_trial_denials')) as t(name)
      where to_regclass('public.' || t.name) is null)),
    ('new tables have forced RLS', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in
        ('v3_invite_campaign', 'v3_invite_grants', 'v3_trial_cards',
         'v3_trial_users', 'v3_trial_denials')
        and (not c.relrowsecurity or not c.relforcerowsecurity))),
    ('browser roles cannot read invite or trial history', not exists (
      select 1 from (values ('v3_invite_campaign'), ('v3_invite_grants'),
        ('v3_trial_cards'), ('v3_trial_users'), ('v3_trial_denials')) as t(name)
      where has_table_privilege('anon', 'public.' || t.name, 'select')
         or has_table_privilege('authenticated', 'public.' || t.name, 'select'))),
    ('browser roles cannot execute claim functions',
      not has_function_privilege('anon', 'public.v3_claim_campaign_invite(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.v3_claim_campaign_invite(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.v3_claim_trial_card(uuid,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.v3_claim_trial_card(uuid,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.v3_set_manual_invite(uuid,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'public.v3_set_manual_invite(uuid,boolean)', 'execute')),
    ('auth confirmation trigger exists', exists (
      select 1 from pg_trigger where tgname = 'v3_invite_auth_confirm' and not tgisinternal)),
    ('invite checkout race guard exists', exists (
      select 1 from pg_trigger where tgname = 'v3_no_billing_for_invite' and not tgisinternal))
)
select name, case when passed then 'OK' else 'FAIL' end as result
from checks order by name;

commit;
