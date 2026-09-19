-- Run after 001_birth_profiles.sql in the V3-only Supabase project.
-- Billing rows are server-only; browser roles receive no table policies.
begin;

create table public.v3_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v3_subscriptions (
  stripe_subscription_id text primary key check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.v3_billing_customers(stripe_customer_id) on delete cascade,
  stripe_price_id text not null check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  currency text not null check (currency in ('jpy', 'usd')),
  status text not null,
  access_until timestamptz,
  cancel_at_period_end boolean not null default false,
  latest_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index v3_subscriptions_user_access_idx
  on public.v3_subscriptions (user_id, access_until desc);

create table public.v3_stripe_events (
  stripe_event_id text primary key check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null,
  event_created bigint not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);

alter table public.v3_billing_customers enable row level security;
alter table public.v3_billing_customers force row level security;
alter table public.v3_subscriptions enable row level security;
alter table public.v3_subscriptions force row level security;
alter table public.v3_stripe_events enable row level security;
alter table public.v3_stripe_events force row level security;

revoke all on public.v3_billing_customers from public, anon, authenticated;
revoke all on public.v3_subscriptions from public, anon, authenticated;
revoke all on public.v3_stripe_events from public, anon, authenticated;
grant select, insert, update on public.v3_billing_customers to service_role;
grant select, insert, update on public.v3_subscriptions to service_role;
grant select, insert, update on public.v3_stripe_events to service_role;

commit;
