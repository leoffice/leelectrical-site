-- 005_audit_commands.sql
-- Universal non-destructive archive / audit trail (LE Pro §1).
-- Append-only, per-tenant. Mirrors the client `src/lib/auditTrail.js` row shape
-- so the future SupabaseAdapter can write here without migration pain.
--
-- Live store today: overlay `_auditLog` via state.ov (Netlify/CF blob).
-- This table is the durable multi-tenant home once the adapter ships.
--
-- RULES encoded here:
--   • no UPDATE / DELETE policies for authenticated clients (append-only)
--   • tenant isolation via app_tenant_id()
--   • stable entity_id + version/seq + before/after + deleted_at + actor

-- =========================================================== audit_commands
create table if not exists audit_commands (
  id           text primary key,                       -- aud-<ts>-<rand> or uuid
  tenant_id    text not null references tenants(id),
  entity       text not null,                          -- job|payment|invoice|estimate|customer
  entity_id    text not null,                          -- stable record id
  op           text not null check (op in (
                 'create','edit','delete','archive','restore','flag'
               )),
  at           timestamptz not null default now(),
  actor        text not null default 'local',
  version      integer,                                -- monotonic per entity
  before       jsonb,                                  -- prior snapshot (restore)
  after        jsonb,                                  -- new snapshot / tombstone
  delta        jsonb,                                  -- optional field-level patch
  reason       text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_commands_tenant_at_idx
  on audit_commands (tenant_id, at desc);
create index if not exists audit_commands_entity_idx
  on audit_commands (tenant_id, entity, entity_id, at desc);
create index if not exists audit_commands_op_idx
  on audit_commands (tenant_id, op, at desc);

-- Append-only: no updated_at. Service role / owner+dispatch INSERT only.
alter table audit_commands enable row level security;

drop policy if exists audit_commands_read on audit_commands;
drop policy if exists audit_commands_insert on audit_commands;

create policy audit_commands_read on audit_commands
  for select
  using (tenant_id = (select app_tenant_id()));

create policy audit_commands_insert on audit_commands
  for insert
  with check (
    tenant_id = (select app_tenant_id())
    and (select app_role()) in ('owner', 'dispatch')
  );

-- No UPDATE or DELETE policies — rows are immutable for authenticated clients.
-- Service role may still purge in catastrophic recovery (ops-only).

comment on table audit_commands is
  'LE Pro universal non-destructive audit trail. Append-only. Soft-deletes and prior versions live here so nothing is ever truly erased.';
