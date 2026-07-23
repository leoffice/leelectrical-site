-- Batch 2 — White-label security: tenant isolation + complete RLS.
-- CORRECTED 2026-07-23 for live-schema drift found via service-level inspection.
-- Run AFTER 001_tenant_config.sql. Idempotent / safe to re-run.
--
-- WHAT CHANGED FROM THE ORIGINAL (all four points Dispatch reported):
--   1. Helper bodies use `profiles.id = auth.uid()` (live profiles has no
--      user_id). Both helpers are (re)created here as SECURITY DEFINER.
--   2. Neither helper existed live — created in 001 and re-asserted here.
--   3. Legacy live policies are BLANKET-ALLOW and misc-named:
--        agent_messages: anon+authenticated SELECT/INSERT/UPDATE qual=true (anon WRITE)
--        invoices:       "invoices anon select" qual=true
--        customers/jobs/schedules/customer_locations:
--                        auth.role()='authenticated' reads + "Internal access" ALL qual=true
--        messages:       authenticated-ALL
--      Rather than guess each legacy policy NAME (a wrong guess leaves a leak),
--      we ENABLE RLS then DROP EVERY existing policy on each managed table via a
--      dynamic loop, then rebuild the known-good set. RLS-on + zero-policies is
--      default-DENY, so every intermediate state is fail-closed.
--   4. Coverage extended to the tables the original missed:
--        schedules, dispatch_queue, customer_locations.
--
-- Service role bypasses RLS — backend/service-key writers are unaffected. Only
-- anon and authenticated-non-(owner|dispatch) client paths are constrained.
-- >>> See the FLAGS block at the bottom before treating this as done. <<<

-- =========================================================== 1. tenant_id cols
alter table if exists customers          add column if not exists tenant_id text references tenants(id);
alter table if exists jobs               add column if not exists tenant_id text references tenants(id);
alter table if exists profiles           add column if not exists tenant_id text references tenants(id);
alter table if exists messages           add column if not exists tenant_id text references tenants(id);
alter table if exists invoices           add column if not exists tenant_id text references tenants(id);
alter table if exists agent_messages     add column if not exists tenant_id text references tenants(id);
alter table if exists schedules          add column if not exists tenant_id text references tenants(id);
alter table if exists dispatch_queue     add column if not exists tenant_id text references tenants(id);
alter table if exists customer_locations add column if not exists tenant_id text references tenants(id);

-- Backfill existing single-tenant data to 'le' (must run after 001 seeds 'le').
update customers          set tenant_id = 'le' where tenant_id is null;
update jobs               set tenant_id = 'le' where tenant_id is null;
update profiles           set tenant_id = 'le' where tenant_id is null;
update messages           set tenant_id = 'le' where tenant_id is null;
update invoices           set tenant_id = 'le' where tenant_id is null;
update agent_messages     set tenant_id = 'le' where tenant_id is null;
update schedules          set tenant_id = 'le' where tenant_id is null;
update dispatch_queue     set tenant_id = 'le' where tenant_id is null;
update customer_locations set tenant_id = 'le' where tenant_id is null;

create index if not exists customers_tenant_idx          on customers (tenant_id);
create index if not exists jobs_tenant_idx               on jobs (tenant_id);
create index if not exists messages_tenant_idx           on messages (tenant_id);
create index if not exists invoices_tenant_idx           on invoices (tenant_id);
create index if not exists agent_messages_tenant_idx     on agent_messages (tenant_id);
create index if not exists schedules_tenant_idx          on schedules (tenant_id);
create index if not exists dispatch_queue_tenant_idx     on dispatch_queue (tenant_id);
create index if not exists customer_locations_tenant_idx on customer_locations (tenant_id);

-- =========================================================== 2. helpers
-- profiles.id = auth.uid(); SECURITY DEFINER so reading profiles inside a policy
-- does not recurse through profiles' RLS.
create or replace function app_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function app_tenant_id() returns text
  language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- =========================================================== 3. wipe + enable RLS
-- Enable RLS, then drop EVERY existing policy on each managed table (whatever
-- its legacy name). Fail-closed: from here until section 4 recreates policies,
-- these tables are RLS-on with no policy = deny-all.
do $$
declare
  tbl text;
  pol record;
  managed text[] := array[
    'customers','jobs','messages','profiles','invoices','agent_messages',
    'tenants','tenant_config','schedules','dispatch_queue','customer_locations'
  ];
begin
  foreach tbl in array managed loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = tbl) then
      execute format('alter table public.%I enable row level security', tbl);
      for pol in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;
    end if;
  end loop;
end $$;

-- =========================================================== 4a. data-table policies
-- Uniform tenant scoping for every business-data table. Read: any authenticated
-- member of the tenant. Write: owner|dispatch of the tenant. Predicates use
-- (select app_*()) so the helper runs once per query, not once per row.
-- NOTE: 'messages','agent_messages','schedules','dispatch_queue' write roles —
-- see FLAG 2. Kept tight (owner|dispatch) deliberately; loosen only after the
-- real writer identities are confirmed.
do $$
declare
  tbl text;
  data_tables text[] := array[
    'customers','jobs','messages','invoices','agent_messages',
    'schedules','dispatch_queue','customer_locations'
  ];
begin
  foreach tbl in array data_tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = tbl) then
      execute format(
        'create policy %I on public.%I for select using ('
        || 'tenant_id = (select app_tenant_id()) and (select app_role()) is not null)',
        tbl || '_tenant_read', tbl);
      execute format(
        'create policy %I on public.%I for all using ('
        || 'tenant_id = (select app_tenant_id()) and (select app_role()) in (''owner'',''dispatch'')) '
        || 'with check ('
        || 'tenant_id = (select app_tenant_id()) and (select app_role()) in (''owner'',''dispatch''))',
        tbl || '_tenant_write', tbl);
    end if;
  end loop;
end $$;

-- =========================================================== 4b. profiles
-- Users read their own row; owner reads all rows in their tenant. No client
-- write (role/tenant grants are a service-role operation).
create policy profiles_self on profiles
  for select using (id = auth.uid());

create policy profiles_owner_read on profiles
  for select using (
    tenant_id = (select app_tenant_id())
    and (select app_role()) = 'owner'
  );

-- =========================================================== 4c. tenant_config / tenants
create policy tenant_config_read on tenant_config
  for select using (tenant_id = (select app_tenant_id()));

create policy tenant_config_write on tenant_config
  for all
  using (tenant_id = (select app_tenant_id()) and (select app_role()) = 'owner')
  with check (tenant_id = (select app_tenant_id()) and (select app_role()) = 'owner');

create policy tenants_read on tenants
  for select using (id = (select app_tenant_id()));

-- =========================================================== 5. post-apply verify
-- Run these after apply and eyeball the results (each should return NO rows):
--
-- (a) any public table with RLS OFF (still client-reachable, unscoped):
--     select tablename from pg_tables
--     where schemaname='public' and rowsecurity = false;
--
-- (b) any public table RLS-ON but with ZERO policies (deny-all — fine for a
--     locked infra table, but flag any you didn't intend to fully close):
--     select t.tablename from pg_tables t
--     where t.schemaname='public' and t.rowsecurity
--       and not exists (select 1 from pg_policies p
--                       where p.schemaname='public' and p.tablename=t.tablename);
--
-- (c) any remaining BLANKET-ALLOW policy (qual/with_check = true) — must be none
--     on the managed tables:
--     select tablename, policyname, cmd, qual, with_check from pg_policies
--     where schemaname='public' and (qual='true' or with_check='true');
--
-- Then, as the anon key: select on customers/jobs/invoices/agent_messages/
-- schedules/dispatch_queue/customer_locations must all return 0 rows.
