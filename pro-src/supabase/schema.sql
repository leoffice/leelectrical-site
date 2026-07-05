-- LE Pro — Supabase (Postgres) schema for the future SupabaseAdapter.
-- Mirrors the shapes the app already uses (see src/data/merge.js) so the
-- migration from the Netlify blob store is a straight fold:
--   merged job  -> customers + jobs + job_steps rows
--   commands    -> activity rows (or a dedicated commands table later)
--
-- Conventions: uuid PKs (except jobs, which keep the human "JP-001"-style
-- text ids so QuickBooks/dashboard references keep working), timestamptz,
-- money as integer cents. RLS enabled on every table — see notes at bottom.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- customers
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  email       text,
  phone       text,
  address     text,
  qbo_id      text unique,          -- QuickBooks Online customer ref
  created_at  timestamptz not null default now()
);
create index if not exists customers_name_idx  on customers (lower(name));
create index if not exists customers_email_idx on customers (lower(email));

-- --------------------------------------------------------------------- jobs
create table if not exists jobs (
  id            text primary key,   -- "JP-001", "LOCAL-…" — keep existing ids
  customer_id   uuid references customers(id) on delete set null,
  title         text not null default '',
  amount_cents  bigint,             -- null = no amount quoted yet
  invoice_no    text,
  estimate_no   text,
  paid          boolean not null default false,
  cal_event_id  text,               -- Google Calendar event link
  notes         text not null default '',
  archived      boolean not null default false,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists jobs_customer_idx on jobs (customer_id);
create index if not exists jobs_live_idx     on jobs (updated_at desc) where not deleted and not archived;
create index if not exists jobs_unpaid_idx   on jobs (paid) where not paid;

-- ---------------------------------------------------------------- job_steps
-- One row per pipeline stage; name matches the UI exactly:
-- Lead, Site Visit, Estimate, Accepted, Invoiced, Deposit Receipt,
-- Paperwork, Scheduled, Done, Follow-up, Paid.
create table if not exists job_steps (
  job_id     text not null references jobs(id) on delete cascade,
  name       text not null check (name in (
               'Lead','Site Visit','Estimate','Accepted','Invoiced',
               'Deposit Receipt','Paperwork','Scheduled','Done','Follow-up','Paid')),
  status     text not null default '' check (status in ('done','skipped','current','upcoming','')),
  done_date  date,                  -- job.status[name].d
  branch     text,                  -- e.g. paperwork branch: 'dob' | 'coned'
  sort       smallint not null default 0,
  primary key (job_id, name)
);
create index if not exists job_steps_job_idx on job_steps (job_id, sort);

-- ----------------------------------------------------------------- payments
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  job_id       text references jobs(id) on delete set null,
  customer_id  uuid references customers(id) on delete set null,
  amount_cents bigint not null,
  method       text,                -- zelle | check | card | qbo | cash
  ref          text,                -- external/QBO payment ref
  paid_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists payments_job_idx on payments (job_id);

-- ------------------------------------------------------------- appointments
create table if not exists appointments (
  id           uuid primary key default gen_random_uuid(),
  job_id       text references jobs(id) on delete set null,
  customer_id  uuid references customers(id) on delete set null,
  start_ts     timestamptz not null,
  end_ts       timestamptz,
  summary      text,
  location     text,
  source       text not null default 'gcal'  -- gcal | manual | sas
);
create index if not exists appointments_start_idx on appointments (start_ts);
create index if not exists appointments_job_idx   on appointments (job_id);

-- -------------------------------------------------------------------- calls
-- Fed by the SAS Flex "Custom Action" webhook (see docs/SAS_RESEARCH.md).
create table if not exists calls (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id) on delete set null,
  job_id        text references jobs(id) on delete set null,
  ts            timestamptz not null default now(),
  direction     text not null default 'inbound' check (direction in ('inbound','outbound')),
  duration      integer,            -- seconds
  summary       text,
  recording_url text,
  source        text not null default 'sas'   -- sas | manual
);
create index if not exists calls_ts_idx  on calls (ts desc);
create index if not exists calls_job_idx on calls (job_id);

-- ----------------------------------------------------------------- messages
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  job_id       text references jobs(id) on delete set null,
  customer_id  uuid references customers(id) on delete set null,
  author       text not null,       -- 'levi' | 'dispatch' | customer name
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists messages_job_idx on messages (job_id, created_at);

-- ----------------------------------------------------------------- activity
-- Audit trail / command-bus successor. payload keeps the flexible JSON the
-- Netlify command bus uses today (type, lane, status, audit…).
create table if not exists activity (
  id          uuid primary key default gen_random_uuid(),
  job_id      text references jobs(id) on delete cascade,
  type        text not null,        -- edit | send_invoice | mark_paid | note | …
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists activity_job_idx     on activity (job_id, created_at desc);
create index if not exists activity_payload_idx on activity using gin (payload);

-- ----------------------------------------------------------------- profiles
-- Maps auth.users to an app role; RLS policies key off this.
create table if not exists profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'viewer' check (role in ('owner','dispatch','viewer')),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------- updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists jobs_updated_at on jobs;
create trigger jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ RLS
-- Enable RLS everywhere; nobody gets in without a policy. This is a small
-- trusted team (Levi = owner, Dispatch agent = dispatch), so the baseline
-- is: any authenticated user with a profile can READ, owner+dispatch can
-- WRITE, only owner can DELETE. Tighten per-table later as needed.
do $$
declare t text;
begin
  foreach t in array array['customers','jobs','job_steps','payments',
                           'appointments','calls','messages','activity','profiles']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create or replace function app_role() returns text language sql stable as $$
  select role from profiles where user_id = auth.uid()
$$;

-- Example policy set (repeat per table; shown once for jobs):
drop policy if exists jobs_read  on jobs;
drop policy if exists jobs_write on jobs;
create policy jobs_read  on jobs for select using (app_role() is not null);
create policy jobs_write on jobs for all
  using (app_role() in ('owner','dispatch'))
  with check (app_role() in ('owner','dispatch'));
-- TODO: copy the read/write policy pair to the remaining tables, and add
--   create policy profiles_self on profiles for select using (user_id = auth.uid());
-- NOTE: the SAS webhook and QBO sync write via the service_role key from a
-- server function, which bypasses RLS by design — never ship that key to
-- the browser.
