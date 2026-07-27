#!/usr/bin/env node
/**
 * KV data-plane isolation proof — the counterpart to verify-tenant-isolation.mjs
 * (which proves the Postgres/RLS side). This one proves the plane the PWA
 * actually uses today: the Cloudflare KV business-data stores (state overlay =
 * customer/job/invoice edits, jobsdata, settings).
 *
 * It runs the REAL handlers over one shared in-memory KV — the exact production
 * shape (single KV namespace, isolation via per-tenant key prefixing in
 * lib/storage/index.mjs + lib/tenant.mjs). The only stub is the Supabase profiles
 * lookup (a bearer token → its tenant), standing in for GoTrue + RLS.
 *
 * No network, no deploy, no credentials. Exit 0 = all pass, 1 = any leak.
 *
 *   node scripts/verify-kv-isolation.mjs
 */

import { bindStorageEnv } from "../../netlify/functions/lib/storage/index.mjs";
import { _clearTenantCache } from "../../netlify/functions/lib/tenant.mjs";
import stateHandler from "../../netlify/functions/state.mjs";
import jobsdataHandler from "../../netlify/functions/jobsdata.mjs";
import settingsHandler from "../../netlify/functions/settings.mjs";

// ---- in-memory Cloudflare-KV-shaped backend --------------------------------
function makeKV() {
  const m = new Map();
  return {
    _map: m,
    async get(key, type) {
      const raw = m.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, val) {
      m.set(key, typeof val === "string" ? val : JSON.stringify(val));
    },
    async getWithMetadata(key, type) {
      const raw = m.get(key);
      return raw == null ? null : { value: type === "json" ? JSON.parse(raw) : raw, metadata: {} };
    },
    async delete(key) {
      m.delete(key);
    },
    async list({ prefix } = {}) {
      return { keys: [...m.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })) };
    },
  };
}

const TOKEN_TENANT = { tokA: "le", tokB: "acme" }; // A = incumbent (legacy keys), B = fresh tenant

const kv = makeKV();
bindStorageEnv({ STORAGE_BACKEND: "cloudflare", LE_KV: kv });
_clearTenantCache();

globalThis.fetch = async (url, init) => {
  if (String(url).includes("/rest/v1/profiles")) {
    const auth = (init && init.headers && init.headers.Authorization) || "";
    const tenant = TOKEN_TENANT[String(auth).replace(/^Bearer\s+/i, "")];
    return { ok: true, json: async () => (tenant ? [{ tenant_id: tenant }] : []) };
  }
  throw new Error("unexpected fetch: " + url);
};

// ---- helpers ----------------------------------------------------------------
const results = [];
const PASS = (n, d = "") => (results.push({ ok: true, n, d }), console.log(`✅ ${n}${d ? " — " + d : ""}`));
const FAIL = (n, d = "") => (results.push({ ok: false, n, d }), console.error(`❌ ${n}${d ? " — " + d : ""}`));

function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["content-type"] = "application/json";
  return new Request(`https://leelectrical.us/.netlify/functions/${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
const asJson = async (res) => JSON.parse(await res.text());

async function main() {
  console.log("\nKV data-plane isolation proof (in-memory, real handlers)\n");

  // 1) state overlay: customer/job/invoice edits, both directions
  await stateHandler(req("POST", "state", { token: "tokA", body: { ov: { "job-A1": { customer: "Acme A", invoiceNo: "A-100" } } } }));
  await stateHandler(req("POST", "state", { token: "tokB", body: { ov: { "job-B1": { customer: "Beta B", invoiceNo: "B-200" } } } }));
  const a = await asJson(await stateHandler(req("GET", "state", { token: "tokA" })));
  const b = await asJson(await stateHandler(req("GET", "state", { token: "tokB" })));
  (Object.keys(a.ov).join() === "job-A1" && !a.ov["job-B1"])
    ? PASS("A reads only A's customer/job/invoice edits")
    : FAIL("A read leaked B", JSON.stringify(Object.keys(a.ov)));
  (Object.keys(b.ov).join() === "job-B1" && !b.ov["job-A1"])
    ? PASS("B reads only B's customer/job/invoice edits")
    : FAIL("B read leaked A", JSON.stringify(Object.keys(b.ov)));

  // 2) physical key separation (le=legacy, acme=namespaced)
  const keys = [...kv._map.keys()];
  keys.includes("jobstate/ov-v1") ? PASS("LE keeps legacy key jobstate/ov-v1 (zero migration)") : FAIL("LE legacy key missing");
  keys.includes("jobstate/t/acme/ov-v1") ? PASS("acme isolated under jobstate/t/acme/ov-v1") : FAIL("acme namespace missing");

  // 3) forged body cannot cross tenants
  await stateHandler(req("POST", "state", { token: "tokB", body: { tenant: "le", ov: { "job-A1": { customer: "HIJACKED" } } } }));
  const aAfter = await asJson(await stateHandler(req("GET", "state", { token: "tokA" })));
  aAfter.ov["job-A1"].customer === "Acme A"
    ? PASS("forged { tenant:'le' } body ignored — A's data untouched")
    : FAIL("cross-tenant write via forged body", aAfter.ov["job-A1"].customer);

  // 4) tokenless → incumbent (le); present-but-invalid token → DENIED (fail closed)
  const anon = await asJson(await stateHandler(req("GET", "state", {})));
  !anon.ov["job-B1"] ? PASS("tokenless request → LE, never B's data") : FAIL("tokenless leaked B");
  const badRes = await stateHandler(req("GET", "state", { token: "nope" }));
  const badBody = await asJson(badRes);
  badRes.status === 401 && !badBody.ov
    ? PASS("invalid token → 401 denied, never B's or LE's data")
    : FAIL("invalid token not denied", `status=${badRes.status}`);

  // 5) jobsdata isolation
  await jobsdataHandler(req("POST", "jobsdata", { token: "tokA", body: { op: "set", jobs: [{ id: "JA-1" }] } }));
  await jobsdataHandler(req("POST", "jobsdata", { token: "tokB", body: { op: "set", jobs: [{ id: "JB-1" }] } }));
  const ja = await asJson(await jobsdataHandler(req("GET", "jobsdata", { token: "tokA" })));
  const jb = await asJson(await jobsdataHandler(req("GET", "jobsdata", { token: "tokB" })));
  ja.jobs.map((j) => j.id).join() === "JA-1" && jb.jobs.map((j) => j.id).join() === "JB-1"
    ? PASS("jobsdata: A and B job lists never cross")
    : FAIL("jobsdata cross-leak", `A=${ja.jobs.map((j) => j.id)} B=${jb.jobs.map((j) => j.id)}`);

  // 6) settings isolation
  await settingsHandler(req("POST", "settings", { token: "tokA", body: { profile: { companyName: "LE Electrical" } } }));
  await settingsHandler(req("POST", "settings", { token: "tokB", body: { profile: { companyName: "Acme Plumbing" } } }));
  const sa = await asJson(await settingsHandler(req("GET", "settings", { token: "tokA" })));
  const sb = await asJson(await settingsHandler(req("GET", "settings", { token: "tokB" })));
  sa.profile.companyName === "LE Electrical" && sb.profile.companyName === "Acme Plumbing"
    ? PASS("settings: each tenant reads its own tenant_config")
    : FAIL("settings cross-leak", `A=${sa.profile.companyName} B=${sb.profile.companyName}`);

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n──────── ${results.length - fails} PASS · ${fails} FAIL ────────`);
  if (fails) {
    console.error("\nKV DATA-PLANE ISOLATION FAILED — do not ship.");
    process.exit(1);
  }
  console.log("\nAll KV data-plane isolation checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Unexpected error:", e.stack || e.message);
  process.exit(2);
});
