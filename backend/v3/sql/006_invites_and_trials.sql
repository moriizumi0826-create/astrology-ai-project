-- V3-only migration. This does not activate the campaign or the 30-day trial.
begin;

create table public.v3_invite_campaign (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz not null,
  max_automatic_grants integer not null check (max_automatic_grants >= 0),
  automatic_grants_used integer not null default 0
    check (automatic_grants_used >= 0 and automatic_grants_used <= max_automatic_grants),
  check (not enabled or starts_at is not null)
);
insert into public.v3_invite_campaign (id, ends_at, max_automatic_grants)
values (1, '2026-11-01 00:00:00+09', 25);

create table public.v3_invite_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('campaign', 'manual')),
  granted_at timestamptz not null default now()
);

-- Keep the number of consumed campaign places even if an account is deleted.
create table public.v3_trial_cards (
  fingerprint text primary key check (length(fingerprint) between 8 and 128),
  first_user_id uuid references auth.users(id) on delete set null,
  first_used_at timestamptz not null default now()
);
create table public.v3_trial_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fingerprint text not null references public.v3_trial_cards(fingerprint),
  stripe_subscription_id text not null unique
    check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  first_used_at timestamptz not null default now()
);
create table public.v3_trial_denials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  denied_at timestamptz not null default now()
);

create function public.v3_claim_campaign_invite(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  campaign public.v3_invite_campaign%rowtype;
  member auth.users%rowtype;
begin
  if exists (select 1 from public.v3_invite_grants where user_id = p_user_id) then
    return true;
  end if;
  -- Match the lock order used by manual grants and billing-customer creation.
  -- Otherwise Checkout could create a customer just after this function checks.
  select * into member from auth.users where id = p_user_id for update;
  if not found or member.email_confirmed_at is null then
    return false;
  end if;
  if exists (select 1 from public.v3_invite_grants where user_id = p_user_id) then
    return true;
  end if;
  select * into campaign from public.v3_invite_campaign where id = 1;
  if not found or not campaign.enabled or now() < campaign.starts_at
      or member.created_at < campaign.starts_at
      or member.created_at >= campaign.ends_at
      or member.email_confirmed_at >= campaign.ends_at then
    return false;
  end if;
  select * into campaign from public.v3_invite_campaign where id = 1 for update;
  if not campaign.enabled or campaign.automatic_grants_used >= campaign.max_automatic_grants
      or member.created_at < campaign.starts_at or member.created_at >= campaign.ends_at
      or member.email_confirmed_at >= campaign.ends_at then
    return false;
  end if;
  -- Even an in-progress Checkout customer must not silently become a free invite.
  if exists (select 1 from public.v3_billing_customers where user_id = p_user_id) then
    return false;
  end if;
  insert into public.v3_invite_grants (user_id, source) values (p_user_id, 'campaign');
  update public.v3_invite_campaign
     set automatic_grants_used = automatic_grants_used + 1 where id = 1;
  return true;
end;
$$;

-- Allocate at email confirmation, not at the next visit. The login-side RPC is
-- still a recovery path if this trigger had a transient failure.
create function public.v3_assign_invite_on_auth_confirm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    if tg_op = 'INSERT' then
      perform public.v3_claim_campaign_invite(new.id);
    elsif old.email_confirmed_at is distinct from new.email_confirmed_at then
      perform public.v3_claim_campaign_invite(new.id);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'V3 invite assignment deferred (SQLSTATE %)', sqlstate;
  return new;
end;
$$;
create trigger v3_invite_auth_confirm
after insert or update of email_confirmed_at on auth.users
for each row execute function public.v3_assign_invite_on_auth_confirm();

create function public.v3_set_manual_invite(p_user_id uuid, p_grant boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Serialise with billing-customer creation so a grant cannot race Checkout.
  perform 1 from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if p_grant then
    -- Existing or in-progress Stripe customers require a separate billing review.
    if exists (select 1 from public.v3_billing_customers where user_id = p_user_id) then
      raise exception 'billing customer exists; review Stripe before granting';
    end if;
    insert into public.v3_invite_grants (user_id, source)
      values (p_user_id, 'manual') on conflict (user_id) do nothing;
  else
    delete from public.v3_invite_grants where user_id = p_user_id;
  end if;
  return true;
end;
$$;

create function public.v3_block_invite_billing_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = new.user_id for update;
  if exists (select 1 from public.v3_invite_grants where user_id = new.user_id) then
    raise exception 'invite account cannot start a billing customer';
  end if;
  return new;
end;
$$;
create trigger v3_no_billing_for_invite
before insert on public.v3_billing_customers
for each row execute function public.v3_block_invite_billing_customer();

create function public.v3_claim_trial_card(p_user_id uuid, p_fingerprint text,
  p_subscription_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare previous_fingerprint text;
declare previous_subscription_id text;
declare previous_user uuid;
begin
  if p_fingerprint is null or length(p_fingerprint) not between 8 and 128
      or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
    return false;
  end if;
  -- Serialise both same-account and same-card attempts before checking history.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint, 1));
  select fingerprint, stripe_subscription_id into previous_fingerprint, previous_subscription_id
    from public.v3_trial_users where user_id = p_user_id;
  if found then
    if previous_fingerprint = p_fingerprint and previous_subscription_id = p_subscription_id then
      return true;
    end if;
    insert into public.v3_trial_denials (user_id) values (p_user_id)
      on conflict (user_id) do nothing;
    return false;
  end if;
  select first_user_id into previous_user from public.v3_trial_cards
    where fingerprint = p_fingerprint;
  if found then
    insert into public.v3_trial_denials (user_id) values (p_user_id)
      on conflict (user_id) do nothing;
    return false;
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;
  insert into public.v3_trial_cards (fingerprint, first_user_id)
    values (p_fingerprint, p_user_id);
  insert into public.v3_trial_users (user_id, fingerprint, stripe_subscription_id)
    values (p_user_id, p_fingerprint, p_subscription_id);
  return true;
end;
$$;

alter table public.v3_invite_campaign enable row level security;
alter table public.v3_invite_campaign force row level security;
alter table public.v3_invite_grants enable row level security;
alter table public.v3_invite_grants force row level security;
alter table public.v3_trial_cards enable row level security;
alter table public.v3_trial_cards force row level security;
alter table public.v3_trial_users enable row level security;
alter table public.v3_trial_users force row level security;
alter table public.v3_trial_denials enable row level security;
alter table public.v3_trial_denials force row level security;

revoke all on public.v3_invite_campaign, public.v3_invite_grants,
  public.v3_trial_cards, public.v3_trial_users, public.v3_trial_denials
  from public, anon, authenticated;
grant select, update on public.v3_invite_campaign to service_role;
grant select on public.v3_invite_grants, public.v3_trial_users,
  public.v3_trial_denials to service_role;
revoke all on function public.v3_claim_campaign_invite(uuid) from public, anon, authenticated;
revoke all on function public.v3_assign_invite_on_auth_confirm() from public, anon, authenticated;
revoke all on function public.v3_set_manual_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.v3_block_invite_billing_customer() from public, anon, authenticated;
revoke all on function public.v3_claim_trial_card(uuid, text, text) from public, anon, authenticated;
grant execute on function public.v3_claim_campaign_invite(uuid) to service_role;
grant execute on function public.v3_set_manual_invite(uuid, boolean) to service_role;
grant execute on function public.v3_claim_trial_card(uuid, text, text) to service_role;

commit;
