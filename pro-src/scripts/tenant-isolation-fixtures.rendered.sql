-- ============================================================================
-- RENDERED isolation-test fixtures — UUIDs inlined for Dispatch's SQL runner
-- (management API / SQL editor; NO psql \set meta-commands).
-- Prereqs: migrations 001 + 002 applied; the two throwaway auth users exist:
--   iso-a  dc8eab1f-8fc2-4d3a-9f3c-71c31b5d4d34  -> tenant A (le)    owner
--   iso-b  71b459ad-f0ea-4089-8f72-631e04dbbb64  -> tenant B (test2) owner
-- Idempotent (where-not-exists / on-conflict). Teardown block at the bottom.
-- Leave in place afterward as the standing regression gate (clearly marked).
-- ============================================================================

-- ---------------------------------------------------------------- tenant B
insert into tenants (id, name)
values ('test2', 'Isolation Test Co.')
on conflict (id) do nothing;

-- Non-internal Pro tenant, so the Section-6 escalation probe is meaningful.
insert into tenant_config (
  tenant_id, company_name, primary_color, support_email,
  plan_tier, crew_addon, internal
) values (
  'test2', 'Isolation Test Co.', '#3355ff', 'owner@test2.local',
  'pro', false, false
)
on conflict (tenant_id) do update set plan_tier = 'pro', internal = false;

-- ---------------------------------------------------------------- B data rows
-- One row per leak-relevant table so isolation is provable BOTH directions
-- (iso-a must not see these; iso-b must not see le's rows). Marked 'ISO-B'.
insert into customers (name, tenant_id)
select 'ISO-B Customer', 'test2'
where not exists (select 1 from customers where name = 'ISO-B Customer' and tenant_id = 'test2');

insert into invoices (ref_number, customer_name, amount, balance, status, tenant_id)
select 'ISO-T2-001', 'ISO-B Invoice', 111, 111, 'Open', 'test2'
where not exists (select 1 from invoices where customer_name = 'ISO-B Invoice' and tenant_id = 'test2');

insert into agent_messages (sender, recipient, channel, body, status, tenant_id)
select 'iso-b', 'dispatch', 'test', 'ISO-B agent message', 'unread', 'test2'
where not exists (select 1 from agent_messages where body = 'ISO-B agent message' and tenant_id = 'test2');

-- ---------------------------------------------------------------- profiles
-- LIVE profiles keys on `id` (= auth.uid()). Role 'owner' (in the constrained
-- vocabulary) so both test users have read + write for their tenant.
insert into profiles (id, tenant_id, role)
values ('71b459ad-f0ea-4089-8f72-631e04dbbb64'::uuid, 'test2', 'owner')
on conflict (id) do update set tenant_id = 'test2', role = 'owner';

insert into profiles (id, tenant_id, role)
values ('dc8eab1f-8fc2-4d3a-9f3c-71c31b5d4d34'::uuid, 'le', 'owner')
on conflict (id) do update set tenant_id = 'le', role = 'owner';

-- ---------------------------------------------------------------- verify seed
select 'tenants' src, id, name from tenants where id in ('le','test2')
union all
select 'config', tenant_id, plan_tier || ' internal=' || internal from tenant_config where tenant_id = 'test2'
union all
select 'profile', id::text, tenant_id || '/' || role from profiles
  where id in ('dc8eab1f-8fc2-4d3a-9f3c-71c31b5d4d34','71b459ad-f0ea-4089-8f72-631e04dbbb64');

-- ============================================================================
-- TEARDOWN (run only when retiring the regression gate):
--   delete from customers      where tenant_id = 'test2';
--   delete from invoices       where tenant_id = 'test2';
--   delete from agent_messages where tenant_id = 'test2';
--   delete from profiles       where id in ('71b459ad-f0ea-4089-8f72-631e04dbbb64');
--   update profiles set tenant_id='le' where id='dc8eab1f-8fc2-4d3a-9f3c-71c31b5d4d34'; -- (already le)
--   delete from tenant_config  where tenant_id = 'test2';
--   delete from tenants        where id = 'test2';
--   -- then: node scripts/provision-isolation-users.mjs --delete
-- ============================================================================
