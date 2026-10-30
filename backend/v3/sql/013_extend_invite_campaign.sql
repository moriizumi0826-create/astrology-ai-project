-- Extend the existing campaign without resetting its start time, used places,
-- existing invite grants, or billing/trial switches. PostgreSQL infinity has no deadline.
begin;

update public.v3_invite_campaign
   set ends_at = 'infinity'::timestamptz,
       max_automatic_grants = 50
 where id = 1
 returning id, enabled, starts_at, ends_at, max_automatic_grants, automatic_grants_used;

commit;
