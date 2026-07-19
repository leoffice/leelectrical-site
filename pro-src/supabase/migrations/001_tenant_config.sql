-- Batch 1 — tenant_config: the white-label foundation.
--
-- One row per tenant. Holds branding, per-module feature toggles, plan tier,
-- the `internal` dev-tooling flag, and the permit-tracker agency presets.
--
-- The app reads this on load and uses it to render the nav AND to decide which
-- routes to register (see src/lib/tenantConfig.js). Disabled modules are
-- unreachable by URL, not merely hidden.
--
-- LE Electrical is NOT special-cased: it is seeded at the bottom of this file
-- as an ordinary tenant with every module on and internal = true.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tenants
create table if not exists tenants (
  id          text primary key,          -- 'le', or a generated slug at signup
  name        text not null default '',
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- tenant_config
create table if not exists tenant_config (
  tenant_id            text primary key references tenants(id) on delete cascade,

  -- ---- branding -----------------------------------------------------------
  company_name         text not null default '',
  logo_url             text not null default '',
  primary_color        text not null default '#2d8a3e',
  letterhead_template  text not null default 'default',
  support_email        text not null default '',

  -- ---- plan ---------------------------------------------------------------
  plan_tier            text not null default 'free'
                         check (plan_tier in ('free','pro','full')),
  crew_addon           boolean not null default false,

  -- ---- dev tooling --------------------------------------------------------
  -- Unlocks the Build tab, seed/demo generators, debug + log panels and
  -- raw-record views. LE only. Never true for a paying tenant.
  internal             boolean not null default false,

  -- ---- feature toggles ----------------------------------------------------
  -- Sparse per-module overrides on top of the plan-tier defaults, e.g.
  --   {"permits": true}  grants permits to a Pro tenant.
  -- Absent key = inherit the tier default. `internal` overrides all to true.
  -- Known modules: invoicing, estimates, requisitions, permits, crew,
  --                quickbooks, documents, reports.
  module_overrides     jsonb not null default '{}'::jsonb,

  -- ---- permit tracker agencies -------------------------------------------
  -- [{"id":"dob","label":"DOB"},{"id":"coned","label":"Con Edison"}]
  -- NYC defaults ship as the preset; non-NYC tenants relabel (ComEd, etc.).
  agencies             jsonb not null default '[]'::jsonb,

  -- ---- company profile ----------------------------------------------------
  -- Address / license / phone / payment instructions used on invoice,
  -- estimate and letterhead output. Mirrors src/lib/tenantProfile.js.
  profile              jsonb not null default '{}'::jsonb,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column tenant_config.internal is
  'Dev-tooling flag. Gates the Build tab, seed generators, debug panels and raw-record views. Internal tenants only.';
comment on column tenant_config.module_overrides is
  'Sparse per-module boolean overrides on top of plan_tier defaults.';

create index if not exists tenant_config_internal_idx
  on tenant_config (internal) where internal;

-- Guard: module_overrides must be a flat object of booleans over known keys.
create or replace function tenant_config_valid_overrides(j jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(
           key in ('invoicing','estimates','requisitions','permits',
                   'crew','quickbooks','documents','reports')
           and jsonb_typeof(value) = 'boolean'
         ), true)
  from jsonb_each(j)
$$;

alter table tenant_config drop constraint if exists tenant_config_overrides_ck;
alter table tenant_config add constraint tenant_config_overrides_ck
  check (tenant_config_valid_overrides(module_overrides));

-- -------------------------------------------------------- updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tenant_config_updated_at on tenant_config;
create trigger tenant_config_updated_at before update on tenant_config
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ RLS
-- A tenant may read only its own config; only an owner may write it, and
-- nobody may set `internal` from the client — that is a service-role change.
alter table tenants       enable row level security;
alter table tenant_config enable row level security;

-- profiles.tenant_id scopes a user to a tenant. Added here because Batch 1 is
-- the first thing that needs it; profiles itself is created in schema.sql.
alter table profiles add column if not exists tenant_id text references tenants(id);

create or replace function app_tenant_id() returns text language sql stable as $$
  select tenant_id from profiles where user_id = auth.uid()
$$;

drop policy if exists tenant_config_read  on tenant_config;
drop policy if exists tenant_config_write on tenant_config;

create policy tenant_config_read on tenant_config
  for select using (tenant_id = app_tenant_id());

-- Note: this permits an owner to write their own row. It does NOT stop them
-- writing internal = true, which Postgres RLS cannot express per-column here —
-- the settings endpoint strips `internal` from client payloads instead.
-- See functions note in the Batch 1 summary.
create policy tenant_config_write on tenant_config
  for all
  using (tenant_id = app_tenant_id() and app_role() = 'owner')
  with check (tenant_id = app_tenant_id() and app_role() = 'owner');

-- ------------------------------------------------------------- seed: LE
-- The flagship instance, as an ordinary tenant: everything on, internal true,
-- NYC agency presets.
insert into tenants (id, name)
values ('le', 'LE Electrical')
on conflict (id) do nothing;

insert into tenant_config (
  tenant_id, company_name, primary_color, support_email,
  plan_tier, crew_addon, internal, agencies
) values (
  'le',
  'BLZ Electric Inc.',
  '#2d8a3e',
  'Office@LeElectrical.us',
  'full',
  true,
  true,
  '[{"id":"dob","label":"DOB"},{"id":"coned","label":"Con Edison"}]'::jsonb
)
on conflict (tenant_id) do update set
  plan_tier = 'full',
  crew_addon = true,
  internal   = true;
