-- Batch 2 — White-label security: tenant isolation + complete RLS.
-- Run in Supabase Dashboard → SQL Editor AFTER 001_tenant_config.sql.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- LIVE STATE (verified 2026-07-22 with public/anon key):
--   • customers/jobs/profiles/messages: tables exist, RLS already ON
--   • Existing policies use app_role() (NOT tenant_id) — so anon gets 0 rows
--     because app_role() is null without a logged-in profile. No contradiction.
--   • tenant_id columns are NOT on those tables yet — this migration adds them
--   • tenants / tenant_config tables do NOT exist until 001 runs
--   • invoices + agent_messages are still world-readable with the public key — locked below
--
-- Goal: every row is scoped to a tenant. Anon only sees nothing.
-- Authenticated users only see their own tenant. Service role bypasses RLS.

-- ------------------------------------------------------------------ tenant_id
-- Add tenant_id to core tables used by multi-tenant SaaS.
alter table if exists customers
  add column if not exists tenant_id text references tenants(id);
alter table if exists jobs
  add column if not exists tenant_id text references tenants(id);
alter table if exists profiles
  add column if not exists tenant_id text references tenants(id);
alter table if exists messages
  add column if not exists tenant_id text references tenants(id);
alter table if exists invoices
  add column if not exists tenant_id text references tenants(id);
alter table if exists agent_messages
  add column if not exists tenant_id text references tenants(id);

-- Backfill LE rows so existing single-tenant data stays under 'le'
update customers set tenant_id = 'le' where tenant_id is null;
update jobs set tenant_id = 'le' where tenant_id is null;
update profiles set tenant_id = 'le' where tenant_id is null;
update messages set tenant_id = 'le' where tenant_id is null;
update invoices set tenant_id = 'le' where tenant_id is null;
update agent_messages set tenant_id = 'le' where tenant_id is null;

create index if not exists customers_tenant_idx on customers (tenant_id);
create index if not exists jobs_tenant_idx on jobs (tenant_id);
create index if not exists messages_tenant_idx on messages (tenant_id);
create index if not exists invoices_tenant_idx on invoices (tenant_id);
create index if not exists agent_messages_tenant_idx on agent_messages (tenant_id);

-- ------------------------------------------------------------------ helpers
-- security definer + fixed search_path so policies cannot be hijacked
create or replace function app_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function app_tenant_id() returns text
  language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where user_id = auth.uid()
$$;

-- ------------------------------------------------------------------ RLS on
do $$
declare t text;
begin
  foreach t in array array[
    'customers','jobs','profiles','messages','tenants','tenant_config',
    'invoices','agent_messages'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;

-- Policy predicates use (select app_tenant_id()) / (select app_role()) so Postgres
-- evaluates the helper once per query, not once per row.

-- ------------------------------------------------------------------ customers
drop policy if exists customers_read on customers;
drop policy if exists customers_write on customers;
drop policy if exists customers_tenant_read on customers;
drop policy if exists customers_tenant_write on customers;

create policy customers_tenant_read on customers
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) is not null
  );

create policy customers_tenant_write on customers
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  );

-- ------------------------------------------------------------------ jobs
drop policy if exists jobs_read on jobs;
drop policy if exists jobs_write on jobs;
drop policy if exists jobs_tenant_read on jobs;
drop policy if exists jobs_tenant_write on jobs;

create policy jobs_tenant_read on jobs
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) is not null
  );

create policy jobs_tenant_write on jobs
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  );

-- ------------------------------------------------------------------ messages
drop policy if exists messages_read on messages;
drop policy if exists messages_write on messages;
drop policy if exists messages_tenant_read on messages;
drop policy if exists messages_tenant_write on messages;

create policy messages_tenant_read on messages
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) is not null
  );

create policy messages_tenant_write on messages
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  );

-- ------------------------------------------------------------------ invoices (was world-readable — lock to tenant)
drop policy if exists invoices_tenant_read on invoices;
drop policy if exists invoices_tenant_write on invoices;

create policy invoices_tenant_read on invoices
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) is not null
  );

create policy invoices_tenant_write on invoices
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  );

-- ------------------------------------------------------------------ agent_messages (was world-readable — lock to tenant)
drop policy if exists agent_messages_tenant_read on agent_messages;
drop policy if exists agent_messages_tenant_write on agent_messages;

create policy agent_messages_tenant_read on agent_messages
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) is not null
  );

create policy agent_messages_tenant_write on agent_messages
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner','dispatch')
  );

-- ------------------------------------------------------------------ profiles
-- Users can read their own profile; owner can read all profiles in their tenant.
drop policy if exists profiles_self on profiles;
drop policy if exists profiles_read on profiles;
drop policy if exists profiles_write on profiles;
drop policy if exists profiles_owner_read on profiles;

create policy profiles_self on profiles
  for select using (user_id = auth.uid());

create policy profiles_owner_read on profiles
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) = 'owner'
  );

-- No client write on profiles by default — grant/role changes via service role.

-- ------------------------------------------------------------------ tenant_config / tenants (from 001 — restate)
drop policy if exists tenant_config_read on tenant_config;
drop policy if exists tenant_config_write on tenant_config;

create policy tenant_config_read on tenant_config
  for select using (tenant_id = (select app_tenant_id()));

create policy tenant_config_write on tenant_config
  for all
  using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) = 'owner'
  )
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) = 'owner'
  );

drop policy if exists tenants_read on tenants;
create policy tenants_read on tenants
  for select using (id = (select app_tenant_id()));

-- ------------------------------------------------------------------ verify
-- After run, as anon (no login) every select should return 0 rows / RLS deny writes.
-- As authenticated user without profiles row: 0 rows.
-- As user with profiles.tenant_id='le': only 'le' rows.
-- invoices + agent_messages must no longer be world-readable on the public key.
