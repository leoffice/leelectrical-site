-- ============================================================================
-- TEST FIXTURES for scripts/verify-tenant-isolation.mjs — NOT a production
-- migration. Creates a second, throwaway tenant ('test2') with its own config
-- and a few data rows so the cross-tenant matrix has both sides to prove.
--
-- PREREQUISITES (run order):
--   1. 001_tenant_config.sql  and  002_white_label_rls_security.sql  applied.
--   2. Two Supabase AUTH users exist (Dashboard → Authentication → Add user,
--      or the Auth admin API with the service-role key — NOT creatable from
--      SQL). Note each user's UUID. Suggested:
--         tenant A owner : an existing 'le' office login you already have
--         tenant B owner : isolation-b@test.local  (a fresh throwaway)
--   3. Paste the two UUIDs below, then run this file in the SQL Editor
--      (service-role context, so it bypasses RLS to seed).
--
-- Idempotent. A teardown block is at the bottom (commented) to remove test2.
-- Do NOT leave 'test2' in a production launch — tear it down after the proof.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>> EDIT THESE TWO <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
--   TA_UID : the auth uid of the tenant A (le) test owner
--   TB_UID : the auth uid of the tenant B (test2) owner
-- Leave TA_UID null to skip A's profile (if the le owner profile already exists).
\set TA_UID '00000000-0000-0000-0000-000000000000'
\set TB_UID '11111111-1111-1111-1111-111111111111'
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ---------------------------------------------------------------- tenant B
insert into tenants (id, name)
values ('test2', 'Isolation Test Co.')
on conflict (id) do nothing;

-- Non-internal Pro tenant, so the escalation probe (Section 6) is meaningful.
insert into tenant_config (
  tenant_id, company_name, primary_color, support_email,
  plan_tier, crew_addon, internal
) values (
  'test2', 'Isolation Test Co.', '#3355ff', 'owner@test2.local',
  'pro', false, false
)
on conflict (tenant_id) do update set
  plan_tier = 'pro', internal = false;

-- ---------------------------------------------------------------- B data rows
-- Tagged with a stable marker so teardown is exact. Uses only columns known to
-- exist on each table from the live schema; adjust names if your schema differs.
insert into customers (name, tenant_id)
select 'ISO-B Customer', 'test2'
where not exists (select 1 from customers where name = 'ISO-B Customer' and tenant_id = 'test2');

insert into jobs (tenant_id)
select 'test2'
where not exists (select 1 from jobs where tenant_id = 'test2');

insert into invoices (customer_name, amount, balance, status, tenant_id)
select 'ISO-B Invoice', 111, 111, 'Open', 'test2'
where not exists (select 1 from invoices where customer_name = 'ISO-B Invoice' and tenant_id = 'test2');

insert into agent_messages (sender, recipient, channel, body, status, tenant_id)
select 'iso-b', 'dispatch', 'test', 'ISO-B agent message', 'unread', 'test2'
where not exists (select 1 from agent_messages where body = 'ISO-B agent message' and tenant_id = 'test2');

insert into messages (tenant_id)
select 'test2'
where not exists (select 1 from messages where tenant_id = 'test2');

-- ---------------------------------------------------------------- profiles
-- LIVE SCHEMA: profiles has NO user_id column — its PK `id` IS the auth uid
-- (app_role()/app_tenant_id() resolve off `profiles.id = auth.uid()`). So the
-- test user's auth UUID goes into `id`. Role 'owner' so the write-isolation +
-- escalation sections have write rights.
insert into profiles (id, tenant_id, role)
select :'TB_UID'::uuid, 'test2', 'owner'
where :'TB_UID' <> '11111111-1111-1111-1111-111111111111'
on conflict (id) do update set tenant_id = 'test2', role = 'owner';

-- Tenant A owner profile (only if you're using a dedicated le test user and it
-- doesn't already have a profile). Skips when TA_UID is left as the placeholder.
insert into profiles (id, tenant_id, role)
select :'TA_UID'::uuid, 'le', 'owner'
where :'TA_UID' <> '00000000-0000-0000-0000-000000000000'
on conflict (id) do update set tenant_id = 'le', role = 'owner';

-- ---------------------------------------------------------------- verify seed
select 'tenants' src, id, name from tenants where id in ('le','test2')
union all
select 'config', tenant_id, plan_tier || ' internal=' || internal from tenant_config where tenant_id in ('le','test2');

-- ============================================================================
-- TEARDOWN (uncomment and run to remove the test2 tenant after the proof):
-- ----------------------------------------------------------------------------
-- delete from customers      where tenant_id = 'test2';
-- delete from jobs           where tenant_id = 'test2';
-- delete from invoices       where tenant_id = 'test2';
-- delete from agent_messages where tenant_id = 'test2';
-- delete from messages       where tenant_id = 'test2';
-- delete from profiles       where tenant_id = 'test2';
-- delete from tenant_config  where tenant_id = 'test2';
-- delete from tenants        where id = 'test2';
-- ============================================================================
