-- Batch 3 — tenant_config entitlement guard.
-- Run AFTER 001 + 002. Idempotent.
--
-- WHY: 002's tenant_config_write lets a tenant OWNER write their own config row.
-- Postgres RLS cannot gate a single COLUMN, so an authenticated owner could raw-
-- PATCH privileged fields directly against Supabase (bypassing the app):
--   • internal          → unlocks the Build tab / dev tooling / raw-record views
--   • plan_tier         → self-upgrade free → full (unlock paid modules)
--   • crew_addon        → self-grant the paid crew add-on
--   • module_overrides  → self-grant individual paid modules
-- The current app writes settings through netlify settings.mjs, which already
-- strips `internal` server-side — but the white-label direction is the app
-- reading/writing tenant_config DIRECTLY on Supabase, where there is no server
-- middle-layer to strip. This trigger enforces it at the DB for ALL client paths.
--
-- Service role (server functions, migrations, Dispatch) bypasses the guard and
-- may change anything — that is the ONLY path allowed to grant entitlements.

create or replace function tenant_config_guard_entitlements()
returns trigger language plpgsql as $$
begin
  -- Server / service-role writes are trusted (billing, provisioning, migrations).
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Client (authenticated owner) writes: branding fields are theirs to edit;
  -- entitlement + dev-tooling fields are pinned so they cannot be self-granted.
  if tg_op = 'UPDATE' then
    new.internal         := old.internal;
    new.plan_tier        := old.plan_tier;
    new.crew_addon       := old.crew_addon;
    new.module_overrides := old.module_overrides;
  elsif tg_op = 'INSERT' then
    -- A client-created config starts locked-down; only the server can raise it.
    new.internal         := false;
    new.plan_tier        := 'free';
    new.crew_addon       := false;
    new.module_overrides := '{}'::jsonb;
  end if;
  return new;
end $$;

drop trigger if exists tenant_config_guard on tenant_config;
create trigger tenant_config_guard
  before insert or update on tenant_config
  for each row execute function tenant_config_guard_entitlements();

-- Verify (as an authenticated owner, NOT service role):
--   update tenant_config set internal = true where tenant_id = '<your tenant>';
--   select internal from tenant_config where tenant_id = '<your tenant>';  -- still false
