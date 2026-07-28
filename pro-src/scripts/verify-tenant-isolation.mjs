#!/usr/bin/env node
/**
 * Cross-tenant isolation proof for the white-label Supabase backbone.
 * Run this the second migrations 001 + 002 land, as the flawless-v1 gate
 * before self-serve signup is opened.
 *
 * WHAT IT PROVES (both directions, no collision):
 *   1. ANON sees nothing        — every guarded table returns 0 rows to the
 *                                  public/anon key. This is the leak gate:
 *                                  invoices + agent_messages are world-readable
 *                                  TODAY and must drop to 0 after 002.
 *   2. Tenant A read-scoping     — an authenticated A user sees ONLY tenant A
 *                                  rows; naming B explicitly still yields 0.
 *   3. Tenant B read-scoping     — symmetric.
 *   4. No collision              — the row-id sets visible to A and to B are
 *                                  disjoint for every table (no shared row).
 *   5. Write isolation (opt-in)  — A cannot INSERT into B, cannot UPDATE B's
 *                                  rows; own-tenant write works and self-cleans.
 *   6. internal-flag escalation  — probes whether a non-internal owner can set
 *                                  tenant_config.internal via direct REST
 *                                  (RLS cannot block this per-column; the
 *                                  mitigation is app-layer stripping). WARN.
 *
 * READ-ONLY BY DEFAULT. Sections 5 & 6 mutate and only run under --allow-writes;
 * both self-clean. Nothing here needs the service-role key.
 *
 * Usage:
 *   # Leak gate only — no test users needed. Run this the instant 001+002 land:
 *   node scripts/verify-tenant-isolation.mjs --anon-only
 *
 *   # Full two-tenant matrix (needs fixtures — see tenant-isolation-fixtures.sql):
 *   TA_EMAIL=… TA_PASSWORD=… TA_TENANT=le \
 *   TB_EMAIL=… TB_PASSWORD=… TB_TENANT=test2 \
 *   node scripts/verify-tenant-isolation.mjs
 *
 *   # Full matrix + write-isolation + escalation probe (self-cleaning):
 *   … node scripts/verify-tenant-isolation.mjs --allow-writes
 *
 * Env:
 *   SUPABASE_URL       default: https://scgpxbubakfwypycugoa.supabase.co
 *   SUPABASE_ANON_KEY  default: the publishable key already shipped in-bundle
 *   TA_EMAIL/TA_PASSWORD/TA_TENANT   tenant A login + expected tenant_id
 *   TB_EMAIL/TB_PASSWORD/TB_TENANT   tenant B login + expected tenant_id
 *
 * Exit code: 0 = all PASS (WARN allowed), 1 = any FAIL, 2 = setup/usage error.
 */

const URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const ANON =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";

const args = process.argv.slice(2);
const ANON_ONLY = args.includes("--anon-only");
const ALLOW_WRITES = args.includes("--allow-writes");

// Tables guarded by 002. `hasTenantId` = carries a tenant_id column we can
// assert on; profiles/tenants/tenant_config are handled specially.
// The role vocabulary the 002 write policies + profiles_role_ck constraint enforce.
const VALID_ROLES = ["owner", "dispatch", "viewer"];

const GUARDED = [
  { t: "customers", hasTenantId: true },
  { t: "jobs", hasTenantId: true },
  { t: "messages", hasTenantId: true },
  { t: "invoices", hasTenantId: true }, // was world-readable (anon select)
  { t: "agent_messages", hasTenantId: true }, // was world-readable + anon WRITE
  { t: "schedules", hasTenantId: true }, // was authenticated blanket-allow
  { t: "dispatch_queue", hasTenantId: true }, // added to coverage in 002
  { t: "customer_locations", hasTenantId: true }, // was authenticated blanket-allow
  { t: "tenant_config", hasTenantId: false }, // keyed by tenant_id, one row/tenant
  { t: "tenants", hasTenantId: false }, // keyed by id
];

// ---------------------------------------------------------------- reporting
const results = [];
function record(section, name, status, detail = "") {
  results.push({ section, name, status, detail });
  const icon =
    status === "PASS" ? "✅" : status === "FAIL" ? "❌" : status === "WARN" ? "⚠️ " : "· ";
  const line = `${icon} [${section}] ${name}${detail ? " — " + detail : ""}`;
  // FAILs to stderr so they survive a piped stdout
  (status === "FAIL" ? console.error : console.log)(line);
}
const PASS = (s, n, d) => record(s, n, "PASS", d);
const FAIL = (s, n, d) => record(s, n, "FAIL", d);
const WARN = (s, n, d) => record(s, n, "WARN", d);
const SKIP = (s, n, d) => record(s, n, "SKIP", d);

// ---------------------------------------------------------------- rest helpers
function authHeaders(jwt) {
  return { apikey: ANON, Authorization: `Bearer ${jwt || ANON}` };
}

/**
 * SELECT with an exact post-RLS count. Returns { ok, status, total, rows }.
 * `total` is the count of rows VISIBLE to this caller (RLS already applied),
 * which is exactly the isolation measure we want. status 404 => table missing.
 */
async function select(table, { jwt, query = "select=*", limit = 1000 } = {}) {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: {
      ...authHeaders(jwt),
      Prefer: "count=exact",
      Range: `0-${Math.max(0, limit - 1)}`,
    },
  });
  let rows = [];
  try {
    rows = await res.json();
  } catch {
    /* error body / empty */
  }
  const cr = res.headers.get("content-range") || "";
  const total = cr.includes("/") ? Number(cr.split("/")[1]) : Array.isArray(rows) ? rows.length : 0;
  return { ok: res.ok, status: res.status, total, rows: Array.isArray(rows) ? rows : [] };
}

async function login(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: String(email || "").trim(), password: password || "" }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.error || `login failed (${res.status})`);
  }
  // sub = auth.uid(); app_tenant_id()/app_role() resolve off profiles.user_id = sub
  const sub = data.user?.id || "";
  return { jwt: data.access_token, sub };
}

// ================================================================ SECTION 1
// ANON sees nothing. No credentials required — this is the leak gate.
async function anonIsolation() {
  const S = "1 anon";
  for (const { t } of GUARDED) {
    const r = await select(t, {});
    if (r.status === 404) {
      // tenants / tenant_config legitimately 404 until 001 runs
      if (t === "tenants" || t === "tenant_config") {
        FAIL(S, `${t} missing`, "table 404 — migration 001 has NOT run yet");
      } else {
        FAIL(S, `${t} missing`, `unexpected 404 (${t} should exist)`);
      }
      continue;
    }
    if (!r.ok) {
      FAIL(S, `${t} anon`, `HTTP ${r.status}`);
      continue;
    }
    if (r.total === 0) {
      PASS(S, `${t} anon → 0 rows`);
    } else {
      const sample =
        t === "invoices" || t === "agent_messages" ? " (PII LEAK — 002 not applied)" : "";
      FAIL(S, `${t} anon leak`, `anon sees ${r.total} row(s)${sample}`);
    }
  }
}

// Fetch the set of visible ids for a table as a given user (for collision check).
async function visibleIds(table, jwt) {
  const r = await select(table, { jwt, query: "select=id" });
  return { total: r.total, ids: new Set(r.rows.map((x) => x.id).filter((x) => x != null)) };
}

// ================================================================ SECTION 2/3
// Per-tenant read scoping. Returns id sets for the collision check.
async function tenantReadScoping(label, tenant, otherTenant, jwt) {
  const S = `${label} read`;
  const idSets = {};

  // Sanity: this user's own profile resolves to the expected tenant.
  const prof = await select("profiles", { jwt, query: "select=tenant_id,role" });
  const own = prof.rows.find((p) => p.tenant_id);
  if (own && own.tenant_id === tenant) {
    PASS(S, `profile resolves tenant_id=${tenant}`, `role=${own.role || "?"}`);
  } else {
    FAIL(
      S,
      `profile tenant mismatch`,
      `expected ${tenant}, profiles visible=${JSON.stringify(prof.rows.slice(0, 3))}`
    );
  }

  // Role-vocabulary sanity: the write policies (and profiles_owner_read) key off
  // role ∈ {owner,dispatch,viewer}. A drifted value (e.g. the live 'Master EVED'
  // / 'staff' incident) silently disables writes without denying reads — so a
  // bad role must trip the flawless-v1 gate here, not surface as a mystery later.
  if (own && !VALID_ROLES.includes(own.role)) {
    FAIL(
      S,
      `role out of vocabulary`,
      `role='${own.role}' not in {${VALID_ROLES.join(",")}} — writes will fail; re-apply the profiles_role_ck remap`
    );
  } else if (own) {
    PASS(S, `role in vocabulary`, `role=${own.role}`);
  }

  for (const { t, hasTenantId } of GUARDED) {
    if (t === "tenants") {
      const r = await select(t, { jwt, query: "select=id" });
      const bad = r.rows.filter((x) => x.id !== tenant);
      if (r.rows.length >= 1 && bad.length === 0) PASS(S, `tenants → only ${tenant}`);
      else FAIL(S, `tenants scope`, `saw ${JSON.stringify(r.rows.map((x) => x.id))}`);
      continue;
    }
    if (t === "tenant_config") {
      const r = await select(t, { jwt, query: "select=tenant_id,internal" });
      const bad = r.rows.filter((x) => x.tenant_id !== tenant);
      if (r.rows.length === 1 && bad.length === 0)
        PASS(S, `tenant_config → only ${tenant}`, `internal=${r.rows[0].internal}`);
      else FAIL(S, `tenant_config scope`, `saw ${JSON.stringify(r.rows.map((x) => x.tenant_id))}`);
      continue;
    }
    // tenant-id tables: every visible row must be this tenant; naming the other
    // tenant explicitly must still yield 0.
    const all = await select(t, { jwt, query: "select=id,tenant_id" });
    const foreign = all.rows.filter((x) => x.tenant_id !== tenant);
    if (foreign.length === 0) {
      PASS(S, `${t} → ${all.total} row(s), all ${tenant}`);
    } else {
      FAIL(S, `${t} cross-tenant leak`, `${foreign.length} foreign row(s): ${JSON.stringify(foreign.slice(0, 3))}`);
    }
    // Explicit hostile read of the other tenant.
    const explicit = await select(t, { jwt, query: `select=id&tenant_id=eq.${otherTenant}` });
    if (explicit.total === 0) PASS(S, `${t} explicit read of ${otherTenant} → 0`);
    else FAIL(S, `${t} explicit cross-read`, `named ${otherTenant}, got ${explicit.total} row(s)`);

    idSets[t] = new Set(all.rows.map((x) => x.id).filter((x) => x != null));
  }
  return idSets;
}

// ================================================================ SECTION 4
function noCollision(aSets, bSets) {
  const S = "4 collision";
  for (const { t, hasTenantId } of GUARDED) {
    if (!hasTenantId) continue;
    const a = aSets[t] || new Set();
    const b = bSets[t] || new Set();
    const shared = [...a].filter((id) => b.has(id));
    if (shared.length === 0) PASS(S, `${t}: A∩B row-ids = ∅`, `|A|=${a.size} |B|=${b.size}`);
    else FAIL(S, `${t}: shared rows`, `A and B both see ids ${JSON.stringify(shared.slice(0, 5))}`);
  }
}

// ================================================================ SECTION 5
// Write isolation — opt-in, self-cleaning.
async function writeIsolation(A, B, tenantA, tenantB) {
  const S = "5 write";
  const marker = "__isolation_probe__";

  // 5a. A INSERT into tenant B — must be rejected by WITH CHECK.
  const insB = await fetch(`${URL}/rest/v1/customers`, {
    method: "POST",
    headers: { ...authHeaders(A.jwt), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ name: marker, tenant_id: tenantB }),
  });
  if (insB.status === 201) {
    let created = [];
    try {
      created = await insB.json();
    } catch {}
    const id = created?.[0]?.id;
    FAIL(S, "A insert→B ALLOWED", `CRITICAL: row ${id ?? "?"} written into ${tenantB}. Manual cleanup needed (A cannot delete it).`);
  } else {
    PASS(S, "A insert→B rejected", `HTTP ${insB.status}`);
  }

  // 5b. A INSERT into own tenant — must succeed; then A deletes it (cleanup proof).
  const insA = await fetch(`${URL}/rest/v1/customers`, {
    method: "POST",
    headers: { ...authHeaders(A.jwt), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ name: marker, tenant_id: tenantA }),
  });
  if (insA.status === 201) {
    let created = [];
    try {
      created = await insA.json();
    } catch {}
    const id = created?.[0]?.id;
    const del = await fetch(`${URL}/rest/v1/customers?id=eq.${id}`, {
      method: "DELETE",
      headers: authHeaders(A.jwt),
    });
    if (del.ok) PASS(S, "A insert→A ok + cleaned", `id ${id} inserted and deleted`);
    else WARN(S, "A own-row not cleaned", `id ${id} left behind (HTTP ${del.status}) — delete manually`);
  } else {
    FAIL(S, "A insert→A blocked", `own-tenant write rejected HTTP ${insA.status} (role too low?)`);
  }

  // 5c. A UPDATE one of B's existing rows — RLS should match 0 rows (no write).
  const bRow = await select("customers", { jwt: B.jwt, query: "select=id&limit=1", limit: 1 });
  const bId = bRow.rows?.[0]?.id;
  if (bId == null) {
    SKIP(S, "A update→B", "tenant B has no customer row to target");
  } else {
    const upd = await fetch(`${URL}/rest/v1/customers?id=eq.${bId}`, {
      method: "PATCH",
      headers: { ...authHeaders(A.jwt), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ name: marker }),
    });
    let affected = [];
    try {
      affected = await upd.json();
    } catch {}
    if ((Array.isArray(affected) ? affected.length : 0) === 0) {
      PASS(S, "A update→B affected 0 rows", `HTTP ${upd.status}`);
    } else {
      FAIL(S, "A update→B MUTATED", `CRITICAL: A altered B's row ${bId}. Restore manually.`);
    }
  }
}

// ================================================================ SECTION 6
// Entitlement-escalation probe. RLS cannot gate a single COLUMN, so a tenant
// owner PATCHing their own tenant_config could self-grant privileged fields via
// direct REST unless a guard (migration 003 trigger) pins them. We attempt each
// self-grant as tenant B's owner and check it did not stick; anything that DOES
// stick is a WARN (restored immediately). With 003 applied, all must PASS.
async function escalationProbe(B, tenantB) {
  const S = "6 escalation";
  // Each: field, escalated value, the safe/original value to assert & restore.
  const VECTORS = [
    { field: "internal", attempt: true, safe: false },
    { field: "plan_tier", attempt: "full", safe: "pro" }, // fixtures seed test2 as 'pro'
    { field: "crew_addon", attempt: true, safe: false },
  ];
  const before = await select("tenant_config", { jwt: B.jwt, query: "select=internal,plan_tier,crew_addon" });
  const row = before.rows?.[0];
  if (!row) {
    SKIP(S, "entitlement escalation", `no readable tenant_config row for ${tenantB}`);
    return;
  }
  for (const v of VECTORS) {
    if (row[v.field] === v.attempt) {
      SKIP(S, `${v.field} escalation`, `already ${v.attempt}; probe expects a non-escalated tenant`);
      continue;
    }
    const res = await fetch(`${URL}/rest/v1/tenant_config?tenant_id=eq.${tenantB}`, {
      method: "PATCH",
      headers: { ...authHeaders(B.jwt), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ [v.field]: v.attempt }),
    });
    let rows = [];
    try {
      rows = await res.json();
    } catch {}
    const stuck = rows?.[0]?.[v.field] === v.attempt;
    if (stuck) {
      // Restore immediately so we never leave B privileged.
      await fetch(`${URL}/rest/v1/tenant_config?tenant_id=eq.${tenantB}`, {
        method: "PATCH",
        headers: { ...authHeaders(B.jwt), "Content-Type": "application/json" },
        body: JSON.stringify({ [v.field]: v.safe }),
      });
      WARN(
        S,
        `${v.field} self-grant via REST`,
        `owner set ${v.field}=${JSON.stringify(v.attempt)} through PostgREST (restored). Needs the 003 tenant_config guard trigger — RLS cannot gate a column.`
      );
    } else {
      PASS(S, `${v.field} self-grant blocked`, `direct REST PATCH did not set ${v.field} (HTTP ${res.status})`);
    }
  }
}

// ================================================================ main
async function main() {
  console.log(`\nTenant isolation proof → ${URL}`);
  console.log(`mode: ${ANON_ONLY ? "anon-only" : ALLOW_WRITES ? "full + writes" : "full read-only"}\n`);

  await anonIsolation();

  if (!ANON_ONLY) {
    const need = ["TA_EMAIL", "TA_PASSWORD", "TA_TENANT", "TB_EMAIL", "TB_PASSWORD", "TB_TENANT"];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) {
      console.error(
        `\nSetup error: missing env ${missing.join(", ")}.\n` +
          `Run with --anon-only for the leak gate, or provide two-tenant fixtures ` +
          `(see scripts/tenant-isolation-fixtures.sql).`
      );
      process.exit(2);
    }
    const tenantA = process.env.TA_TENANT;
    const tenantB = process.env.TB_TENANT;
    if (tenantA === tenantB) {
      console.error("Setup error: TA_TENANT and TB_TENANT must differ.");
      process.exit(2);
    }
    let A, B;
    try {
      A = await login(process.env.TA_EMAIL, process.env.TA_PASSWORD);
      B = await login(process.env.TB_EMAIL, process.env.TB_PASSWORD);
    } catch (e) {
      console.error(`\nSetup error: ${e.message}`);
      process.exit(2);
    }
    const aSets = await tenantReadScoping("2 A", tenantA, tenantB, A.jwt);
    const bSets = await tenantReadScoping("3 B", tenantB, tenantA, B.jwt);
    noCollision(aSets, bSets);

    if (ALLOW_WRITES) {
      await writeIsolation(A, B, tenantA, tenantB);
      await escalationProbe(B, tenantB);
    } else {
      SKIP("5 write", "write isolation", "pass --allow-writes to run (self-cleaning)");
    }
  }

  // ------------------------------------------------------------ summary
  const fails = results.filter((r) => r.status === "FAIL");
  const warns = results.filter((r) => r.status === "WARN");
  const passes = results.filter((r) => r.status === "PASS");
  console.log(
    `\n──────── ${passes.length} PASS · ${fails.length} FAIL · ${warns.length} WARN · ` +
      `${results.filter((r) => r.status === "SKIP").length} SKIP ────────`
  );
  if (fails.length) {
    console.error("\nFAILURES:");
    for (const f of fails) console.error(`  ❌ [${f.section}] ${f.name} — ${f.detail}`);
    console.error("\nNOT flawless-v1. Do NOT open signup.");
    process.exit(1);
  }
  if (warns.length) {
    console.log("\nWARNINGS (review before launch):");
    for (const w of warns) console.log(`  ⚠️  [${w.section}] ${w.name} — ${w.detail}`);
  }
  console.log("\nAll isolation checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`\nUnexpected error: ${e.stack || e.message}`);
  process.exit(2);
});
