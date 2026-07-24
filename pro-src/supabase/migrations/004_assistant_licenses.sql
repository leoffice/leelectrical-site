-- Batch 4 — WP7 assistant license activation (per-tenant licenses + module gate).
-- Run AFTER 001/002/003. Idempotent. Preview/branch until shipped via the bus lane.
--
-- The assistant is a GATED MODULE: tenant_config.module_overrides.assistant.
-- 003's entitlement guard already pins module_overrides against non-service_role
-- writes, so ONLY a service-role endpoint (assistant-activate) can flip it on —
-- after validating a real license. This is the activation-must-be-service-role rule.

-- ---- 1) allow the `assistant` module key in module_overrides -----------------
-- (extends the guard from 001 so {"assistant":true} passes the check)
create or replace function tenant_config_valid_overrides(j jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(
           key in ('invoicing','estimates','requisitions','permits',
                   'crew','quickbooks','documents','reports','assistant')
           and jsonb_typeof(value) = 'boolean'
         ), true)
  from jsonb_each(j)
$$;
-- re-assert the constraint so it uses the updated function
alter table tenant_config drop constraint if exists tenant_config_overrides_ck;
alter table tenant_config add constraint tenant_config_overrides_ck
  check (tenant_config_valid_overrides(module_overrides));

-- ---- 2) per-tenant license table --------------------------------------------
-- A key is minted UNBOUND (tenant_id null, status 'issued') and binds to the
-- activating tenant on first redemption. Raw token is never stored — only its hash.
create table if not exists assistant_licenses (
  id            text primary key,                       -- lic_...
  tenant_id     text references tenants(id) on delete cascade,  -- null until activated
  key_hash      text not null unique,                   -- sha256(normalized token)
  token_preview text not null default '',               -- ABCD…WXYZ for the UI
  kind          text not null default 'paid'
                  check (kind in ('owner','paid')),
  label         text not null default '',
  status        text not null default 'issued'
                  check (status in ('issued','active','revoked')),
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);

create index if not exists assistant_licenses_tenant_idx on assistant_licenses (tenant_id);
create index if not exists assistant_licenses_status_idx on assistant_licenses (status);

alter table assistant_licenses enable row level security;

-- RLS: a tenant OWNER reads only its own (bound) licenses. No client writes —
-- mint/activate/revoke are service-role only (service role bypasses RLS).
-- Unbound rows (tenant_id null) are invisible to every tenant.
drop policy if exists assistant_licenses_owner_read on assistant_licenses;
create policy assistant_licenses_owner_read on assistant_licenses
  for select using (
    tenant_id is not null
    and tenant_id = (select app_tenant_id())
    and (select app_role()) = 'owner'
  );
-- (no insert/update/delete policy → only the service role can write)

-- ---- verify -----------------------------------------------------------------
-- As an authenticated owner: select on assistant_licenses returns only your
-- tenant's bound licenses; a client UPDATE/INSERT is denied.
-- As service role (assistant-activate): binds the key + sets
--   module_overrides = module_overrides || '{"assistant":true}'.
