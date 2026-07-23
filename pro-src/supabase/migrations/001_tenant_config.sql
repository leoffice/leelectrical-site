-- Batch 1 — tenant_config: the white-label foundation.
-- CORRECTED 2026-07-23 for live-schema drift found by Dispatch's apply_migration:
--   • live `profiles` has NO user_id column — its PK `id` IS the auth uid
--     (the live "read own profile" policy is auth.uid() = id). Helper bodies
--     therefore use `where id = auth.uid()`.
--   • neither app_role() nor app_tenant_id() exists live — 001 now creates BOTH,
--     as SECURITY DEFINER (required: the helpers read profiles, and a plain
--     invoker function would recurse through profiles' own RLS). 001's
--     tenant_config_write references app_role(), so it must exist first.
--
-- One row per tenant. Holds branding, per-module feature toggles, plan tier,
-- the `internal` dev-tooling flag, and the permit-tracker agency presets.
-- The app reads this on load to render the nav AND decide which routes register
-- (src/lib/tenantConfig.js). Disabled modules are unreachable by URL, not hidden.
-- LE Electrical is NOT special-cased: it is seeded at the bottom as an ordinary
-- tenant with every module on and internal = true.

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

  -- ---- product brand override --------------------------------------------
  -- {"name":"Level","shortName":"Lvl","poweredBy":"Powered by Lvl","logoUrl":"…"}
  -- Empty object = use the platform defaults in shared/productBrand.mjs, which
  -- is the ONE place the product name lives. Renaming the product for everyone
  -- is a change in that file; renaming it for a single tenant is this column.
  -- Blank strings fall through to the default rather than blanking the brand.
  product              jsonb not null default '{}'::jsonb,

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

-- ------------------------------------------------------------------ helpers
-- SECURITY DEFINER + fixed search_path: the helpers read `profiles`, so as
-- plain invoker functions they would recurse through profiles' own RLS. As
-- definer (owned by the table owner) they bypass RLS on that read — the
-- standard Supabase pattern. Live profiles has no user_id; PK `id` = auth.uid().
create or replace function app_tenant_id() returns text
  language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid()
$$;

create or replace function app_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------------ RLS
alter table tenants       enable row level security;
alter table tenant_config enable row level security;

-- profiles.tenant_id scopes a user to a tenant.
alter table profiles add column if not exists tenant_id text references tenants(id);

drop policy if exists tenant_config_read  on tenant_config;
drop policy if exists tenant_config_write on tenant_config;

create policy tenant_config_read on tenant_config
  for select using (tenant_id = (select app_tenant_id()));

-- Permits an owner to write their own row. It does NOT stop them writing
-- internal = true (Postgres RLS cannot gate a single column) — the settings
-- endpoint must strip `internal` from client payloads. See FLAG in the summary.
create policy tenant_config_write on tenant_config
  for all
  using (tenant_id = (select app_tenant_id()) and (select app_role()) = 'owner')
  with check (tenant_id = (select app_tenant_id()) and (select app_role()) = 'owner');

-- ------------------------------------------------------------- seed: LE
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
