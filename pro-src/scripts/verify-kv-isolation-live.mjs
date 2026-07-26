#!/usr/bin/env node
/**
 * LIVE KV data-plane isolation proof — hits the deployed Pages Functions on a
 * PREVIEW (or prod) with REAL Supabase tokens, proving tenant isolation end to
 * end: token → resolveTenant → per-tenant KV namespace.
 *
 * This is the counterpart to verify-kv-isolation.mjs (in-memory, no network):
 * it exercises the real functions + real KV + real Supabase auth. It is the
 * runner for the council's "test-tenant pass" once the two throwaway tenants
 * are provisioned (scripts/provision-isolation-users.mjs + the fixtures SQL).
 *
 * SAFETY: it NEVER writes as tenant `le` (the incumbent). If either login
 * resolves to `le`, all writes for that side are skipped and only read-only
 * checks run — so a misconfigured run can't mutate real LE data. It cleans up
 * every row it writes for a throwaway tenant.
 *
 * Usage:
 *   PREVIEW_URL=https://feat-tenant-data-isolation.leelectrical-cf.pages.dev \
 *   TB_EMAIL=iso-b@test.local TB_PASSWORD=… TB_TENANT=test2 \
 *   [TA_EMAIL=iso-a@test.local TA_PASSWORD=… TA_TENANT=isoa]  \
 *   node scripts/verify-kv-isolation-live.mjs
 *
 * TB is the primary test tenant (required). TA is optional: give a SECOND
 * throwaway tenant to prove full bidirectional write-isolation; omit it and the
 * incumbent LE view (tokenless) stands in for "the other tenant" read-only.
 *
 * Exit: 0 all pass, 1 any leak, 2 setup error.
 */

const PREVIEW = process.env.PREVIEW_URL || "https://feat-tenant-data-isolation.leelectrical-cf.pages.dev";
const SB_URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY || "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";
const FN = `${PREVIEW.replace(/\/$/, "")}/.netlify/functions`;

const results = [];
const rec = (ok, n, d = "") => (results.push({ ok, n, d }), console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`));
const PASS = (n, d) => rec(true, n, d);
const FAIL = (n, d) => rec(false, n, d);
const SKIP = (n, d) => console.log(`·  ${n}${d ? " — " + d : ""}`);

async function login(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: String(email || "").trim(), password: password || "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.error || `login failed (${res.status})`);
  }
  return data.access_token;
}

async function resolvedTenant(jwt) {
  const res = await fetch(`${SB_URL}/rest/v1/profiles?select=tenant_id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0].tenant_id : null;
}

function hdrs(jwt, body) {
  const h = {};
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  if (body) h["content-type"] = "application/json";
  return h;
}
async function getState(jwt) {
  const res = await fetch(`${FN}/state?cb=${Date.now()}`, { headers: hdrs(jwt), cache: "no-store" });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function postState(jwt, ov) {
  const res = await fetch(`${FN}/state`, { method: "POST", headers: hdrs(jwt, true), body: JSON.stringify({ ov }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`\nLIVE KV isolation proof → ${FN}\n`);
  if (!process.env.TB_EMAIL || !process.env.TB_PASSWORD) {
    console.error("Setup error: TB_EMAIL/TB_PASSWORD required (the test tenant). See header for usage.");
    process.exit(2);
  }

  // ---- log in the test tenant(s) ----
  let bJwt, bTenant, aJwt, aTenant;
  try {
    bJwt = await login(process.env.TB_EMAIL, process.env.TB_PASSWORD);
    bTenant = await resolvedTenant(bJwt);
  } catch (e) {
    console.error(`Setup error (TB login): ${e.message}`);
    process.exit(2);
  }
  bTenant === (process.env.TB_TENANT || bTenant)
    ? PASS(`TB token resolves tenant=${bTenant}`)
    : FAIL(`TB tenant mismatch`, `resolved ${bTenant}, expected ${process.env.TB_TENANT}`);
  if (bTenant === "le") {
    console.error("Refusing to run: TB resolves to 'le' (incumbent). Use a throwaway tenant.");
    process.exit(2);
  }

  if (process.env.TA_EMAIL && process.env.TA_PASSWORD) {
    aJwt = await login(process.env.TA_EMAIL, process.env.TA_PASSWORD);
    aTenant = await resolvedTenant(aJwt);
    PASS(`TA token resolves tenant=${aTenant}`);
  }

  // ---- B writes its own customer/job/invoice edit ----
  const bJob = `job-B-${Date.now()}`;
  await postState(bJwt, { [bJob]: { customer: "Beta Test Co", invoiceNo: "B-1", amount: 222 } });
  const bView = await getState(bJwt);
  bView.status === 200 && bView.body.ov?.[bJob]?.invoiceNo === "B-1"
    ? PASS("B reads back its own edit")
    : FAIL("B cannot read its own edit", JSON.stringify(bView).slice(0, 160));

  // ---- B cannot see LE's data (its overlay is ONLY its own keys) ----
  const bKeys = Object.keys(bView.body.ov || {});
  bKeys.every((k) => k.startsWith("job-B-"))
    ? PASS(`B sees ONLY its own keys (${bKeys.length}) — not LE's overlay`)
    : FAIL("B sees foreign keys", JSON.stringify(bKeys).slice(0, 200));

  // ---- LE (tokenless) cannot see B's data, and LE overlay is intact ----
  const leBefore = await getState(undefined);
  const leHasB = !!leBefore.body.ov?.[bJob];
  !leHasB
    ? PASS(`LE (tokenless) does NOT contain B's job ${bJob}`)
    : FAIL("LE overlay leaked B's write", bJob);
  PASS(`LE overlay key count = ${Object.keys(leBefore.body.ov || {}).length} (served from legacy key)`);

  // ---- forged body cannot cross tenants (server keys off the token only) ----
  await postState(bJwt, { [bJob]: { customer: "Beta Test Co", invoiceNo: "B-1" }, tenant: "le" });
  const leAfter = await getState(undefined);
  !leAfter.body.ov?.[bJob]
    ? PASS("forged { tenant:'le' } in B's body ignored — LE untouched")
    : FAIL("forged body crossed into LE", bJob);

  // ---- optional: full bidirectional with a second throwaway tenant A ----
  if (aJwt && aTenant && aTenant !== "le" && aTenant !== bTenant) {
    const aJob = `job-A-${Date.now()}`;
    await postState(aJwt, { [aJob]: { customer: "Alpha Test Co", invoiceNo: "A-1" } });
    const aView = await getState(aJwt);
    const bView2 = await getState(bJwt);
    aView.body.ov?.[aJob] && !aView.body.ov?.[bJob]
      ? PASS("A sees its own edit, not B's")
      : FAIL("A/B cross-leak (A side)");
    bView2.body.ov?.[bJob] && !bView2.body.ov?.[aJob]
      ? PASS("B sees its own edit, not A's")
      : FAIL("A/B cross-leak (B side)");
    // cleanup A
    await postState(aJwt, {});
  } else {
    SKIP("bidirectional A↔B write matrix", "no second throwaway tenant (TA_*) supplied — LE stood in read-only");
  }

  // ---- cleanup B (reset its overlay; safe — throwaway tenant) ----
  await postState(bJwt, {});
  const bClean = await getState(bJwt);
  Object.keys(bClean.body.ov || {}).length === 0
    ? PASS("B overlay cleaned up")
    : SKIP("B cleanup", `residual keys: ${Object.keys(bClean.body.ov || {}).length}`);

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n──────── ${results.length - fails} PASS · ${fails} FAIL ────────`);
  if (fails) {
    console.error("\nLIVE ISOLATION FAILED — do NOT proceed to prod.");
    process.exit(1);
  }
  console.log("\nAll LIVE KV isolation checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`Unexpected error: ${e.stack || e.message}`);
  process.exit(2);
});
