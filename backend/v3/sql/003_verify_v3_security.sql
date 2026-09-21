-- Read-only verification for a freshly prepared V3 Supabase project.
-- Run after 001_birth_profiles.sql and 002_billing.sql.
-- Every row must return result = OK. This script changes no data.
begin read only;

with checks(name, passed) as (
  values
    ('v3_birth_profiles exists', to_regclass('public.v3_birth_profiles') is not null),
    ('v3_billing_customers exists', to_regclass('public.v3_billing_customers') is not null),
    ('v3_subscriptions exists', to_regclass('public.v3_subscriptions') is not null),
    ('v3_stripe_events exists', to_regclass('public.v3_stripe_events') is not null),
    ('all V3 tables have RLS enabled', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('v3_birth_profiles', 'v3_billing_customers', 'v3_subscriptions', 'v3_stripe_events')
        and not c.relrowsecurity
    )),
    ('all V3 tables force RLS', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('v3_birth_profiles', 'v3_billing_customers', 'v3_subscriptions', 'v3_stripe_events')
        and not c.relforcerowsecurity
    )),
    ('birth profile has exactly three owner policies', (
      select count(*) = 3 from pg_policies
      where schemaname = 'public' and tablename = 'v3_birth_profiles'
    )),
    ('billing tables expose no browser policies', not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename in ('v3_billing_customers', 'v3_subscriptions', 'v3_stripe_events')
    )),
    ('anon cannot read birth profiles', not has_table_privilege('anon', 'public.v3_birth_profiles', 'select')),
    ('anon cannot read subscriptions', not has_table_privilege('anon', 'public.v3_subscriptions', 'select')),
    ('authenticated cannot read subscriptions', not has_table_privilege('authenticated', 'public.v3_subscriptions', 'select')),
    ('authenticated can read own birth profile through RLS', has_table_privilege('authenticated', 'public.v3_birth_profiles', 'select')),
    ('authenticated cannot directly update ownership', not has_column_privilege('authenticated', 'public.v3_birth_profiles', 'user_id', 'update')),
    ('anon cannot execute automatic RLS helper', not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')),
    ('authenticated cannot execute automatic RLS helper', not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute')),
    ('subscription lookup index exists', to_regclass('public.v3_subscriptions_user_access_idx') is not null)
)
select name, case when passed then 'OK' else 'FAIL' end as result
from checks
order by name;

commit;
