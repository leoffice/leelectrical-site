// Tenant data-plane isolation proof.
//
// Drives the REAL business-data handlers (state, jobsdata, settings) over a
// single in-memory KV — exactly the production shape: one shared KV namespace,
// isolation achieved purely by the server-side per-tenant key prefixing in
// lib/storage/index.mjs + lib/tenant.mjs. Nothing here is mocked except:
//   • the KV backend (in-memory, but the real createKvJsonStore runs on top), and
//   • the Supabase profiles lookup (global fetch), mapping a bearer token to a
//     tenant — standing in for GoTrue + the RLS profiles_self read.
//
// The acceptance bar: tenant A cannot read or write tenant B's customers /
// jobs / invoices, and vice-versa — both directions, no leakage — and a client
// cannot cross tenants by forging a body field (the server ignores it and uses
// only the token-derived tenant).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindStorageEnv } from "../../netlify/functions/lib/storage/index.mjs";
import { _clearTenantCache } from "../../netlify/functions/lib/tenant.mjs";
import stateHandler from "../../netlify/functions/state.mjs";
import jobsdataHandler from "../../netlify/functions/jobsdata.mjs";
import settingsHandler from "../../netlify/functions/settings.mjs";

// ---- in-memory Cloudflare-KV-shaped backend ---------------------------------
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
      if (raw == null) return null;
      return { value: type === "json" ? JSON.parse(raw) : raw, metadata: {} };
    },
    async delete(key) {
      m.delete(key);
    },
    async list({ prefix } = {}) {
      const keys = [...m.keys()]
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

// Token → tenant. A is the incumbent flagship ("le", LEGACY key namespace);
// B is a fresh tenant ("acme", namespaced under t/acme/). "bad" simulates an
// invalid/expired token (Supabase would 401 → empty profiles → no row).
const TOKEN_TENANT = { tokA: "le", tokB: "acme" };

let kv;

beforeEach(() => {
  kv = makeKV();
  bindStorageEnv({ STORAGE_BACKEND: "cloudflare", LE_KV: kv });
  _clearTenantCache();

  // Stand in for GoTrue + the RLS-scoped profiles read. resolveTenant fetches
  // GET /rest/v1/profiles?select=tenant_id with the caller's bearer token; the
  // token's tenant is returned as the single visible row (RLS profiles_self).
  vi.stubGlobal("fetch", async (url, init) => {
    if (String(url).includes("/rest/v1/profiles")) {
      const auth = (init && init.headers && init.headers.Authorization) || "";
      const tok = String(auth).replace(/^Bearer\s+/i, "");
      const tenant = TOKEN_TENANT[tok];
      return { ok: true, json: async () => (tenant ? [{ tenant_id: tenant }] : []) };
    }
    throw new Error("unexpected fetch: " + url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- request helpers --------------------------------------------------------
function req(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["content-type"] = "application/json";
  return new Request(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
const asJson = async (res) => JSON.parse(await res.text());

// A "customer/job/invoice" edit as it really lands in the ov overlay: keyed by
// job id, carrying customer + invoiceNo fields.
const STATE_URL = "https://leelectrical.us/.netlify/functions/state";
const JOBS_URL = "https://leelectrical.us/.netlify/functions/jobsdata";
const SETTINGS_URL = "https://leelectrical.us/.netlify/functions/settings";

async function saveOv(token, ov) {
  return asJson(await stateHandler(req("POST", STATE_URL, { token, body: { ov } })));
}
async function readOv(token) {
  return asJson(await stateHandler(req("GET", STATE_URL, { token })));
}

describe("state overlay (customer/job/invoice edits) — per-tenant isolation", () => {
  it("A and B write to their own namespace; neither can read the other's", async () => {
    await saveOv("tokA", { "job-A1": { customer: "Acme A", invoiceNo: "A-100", amount: 1111 } });
    await saveOv("tokB", { "job-B1": { customer: "Beta B", invoiceNo: "B-200", amount: 2222 } });

    const a = await readOv("tokA");
    const b = await readOv("tokB");

    // A sees only A's edit.
    expect(Object.keys(a.ov)).toEqual(["job-A1"]);
    expect(a.ov["job-A1"].invoiceNo).toBe("A-100");
    expect(a.ov["job-B1"]).toBeUndefined();

    // B sees only B's edit — no leakage in EITHER direction.
    expect(Object.keys(b.ov)).toEqual(["job-B1"]);
    expect(b.ov["job-B1"].invoiceNo).toBe("B-200");
    expect(b.ov["job-A1"]).toBeUndefined();
  });

  it("stores land under distinct physical KV keys (le=legacy, others=namespaced)", async () => {
    await saveOv("tokA", { "job-A1": { customer: "Acme A" } });
    await saveOv("tokB", { "job-B1": { customer: "Beta B" } });
    const keys = [...kv._map.keys()];
    // LE (incumbent) keeps the legacy key exactly — zero migration.
    expect(keys).toContain("jobstate/ov-v1");
    // Every other tenant is physically separated under t/<tenant>/.
    expect(keys).toContain("jobstate/t/acme/ov-v1");
    // And the legacy key was NOT reused for acme.
    expect(keys).not.toContain("jobstate/t/le/ov-v1");
  });

  it("a forged body cannot cross tenants — server keys only off the token", async () => {
    await saveOv("tokA", { "job-A1": { customer: "Acme A", invoiceNo: "A-100" } });

    // B tries to smuggle a tenant hint + A's job id in the payload. The server
    // ignores any client-supplied tenant and writes only into B's namespace.
    await stateHandler(
      req("POST", STATE_URL, {
        token: "tokB",
        body: { tenant: "le", ov: { "job-A1": { customer: "HIJACKED", invoiceNo: "PWNED" } } },
      })
    );

    // A's real data is untouched.
    const a = await readOv("tokA");
    expect(a.ov["job-A1"].customer).toBe("Acme A");
    expect(a.ov["job-A1"].invoiceNo).toBe("A-100");

    // B's write went to B's own namespace only.
    const b = await readOv("tokB");
    expect(b.ov["job-A1"].customer).toBe("HIJACKED");
    // Physical proof: the hijack lives under t/acme/, never in the legacy key.
    expect(JSON.parse(kv._map.get("jobstate/ov-v1")).ov["job-A1"].customer).toBe("Acme A");
    expect(JSON.parse(kv._map.get("jobstate/t/acme/ov-v1")).ov["job-A1"].customer).toBe("HIJACKED");
  });

  it("no token resolves to the incumbent tenant (LE preserved), never B's data", async () => {
    await saveOv("tokA", { "job-A1": { customer: "Acme A" } }); // A == le
    await saveOv("tokB", { "job-B1": { customer: "Beta B" } });

    const anon = await readOv(undefined); // tokenless → le
    expect(Object.keys(anon.ov)).toEqual(["job-A1"]);
    expect(anon.ov["job-B1"]).toBeUndefined();
  });

  it("an invalid/expired token (present but unresolved) is DENIED, never served B or LE", async () => {
    await saveOv("tokA", { "job-A1": { customer: "Acme A" } }); // le
    await saveOv("tokB", { "job-B1": { customer: "Beta B" } });
    // A present token that resolves to no tenant must fail closed — not fall
    // back to LE (which would leak LE to any authenticated stranger).
    const res = await stateHandler(req("GET", STATE_URL, { token: "bad" }));
    expect(res.status).toBe(401);
    const body = await asJson(res);
    expect(body.ov).toBeUndefined();
  });
});

describe("jobsdata (synced jobs) — per-tenant isolation", () => {
  it("A's job list and B's job list never cross", async () => {
    await asJson(
      await jobsdataHandler(
        req("POST", JOBS_URL, { token: "tokA", body: { op: "set", jobs: [{ id: "JA-1", title: "A job" }] } })
      )
    );
    await asJson(
      await jobsdataHandler(
        req("POST", JOBS_URL, { token: "tokB", body: { op: "set", jobs: [{ id: "JB-1", title: "B job" }] } })
      )
    );

    const a = await asJson(await jobsdataHandler(req("GET", JOBS_URL, { token: "tokA" })));
    const b = await asJson(await jobsdataHandler(req("GET", JOBS_URL, { token: "tokB" })));

    expect(a.jobs.map((j) => j.id)).toEqual(["JA-1"]);
    expect(b.jobs.map((j) => j.id)).toEqual(["JB-1"]);
    expect(a.jobs.find((j) => j.id === "JB-1")).toBeUndefined();
    expect(b.jobs.find((j) => j.id === "JA-1")).toBeUndefined();
  });
});

describe("settings (tenant_config) — per-tenant isolation", () => {
  it("each tenant reads/writes its own settings blob", async () => {
    await asJson(
      await settingsHandler(
        req("POST", SETTINGS_URL, { token: "tokA", body: { profile: { companyName: "LE Electrical" } } })
      )
    );
    await asJson(
      await settingsHandler(
        req("POST", SETTINGS_URL, { token: "tokB", body: { profile: { companyName: "Acme Plumbing" } } })
      )
    );

    const a = await asJson(await settingsHandler(req("GET", SETTINGS_URL, { token: "tokA" })));
    const b = await asJson(await settingsHandler(req("GET", SETTINGS_URL, { token: "tokB" })));

    expect(a.profile.companyName).toBe("LE Electrical");
    expect(b.profile.companyName).toBe("Acme Plumbing");
    // Physical separation.
    expect([...kv._map.keys()]).toContain("settings/tenant-settings-v1");
    expect([...kv._map.keys()]).toContain("settings/t/acme/tenant-settings-v1");
  });
});

describe("STRICT mode — deny when the caller cannot be attributed", () => {
  it("resolveTenant returns null for a tokenless request when TENANT_STRICT=1", async () => {
    // tenant.mjs reads TENANT_STRICT at import time — load a fresh instance with
    // the flag set. The handlers then translate null → HTTP 401 (asserted by
    // inspection: `if (tenant == null) return json(..., 401)`).
    vi.resetModules();
    const prev = process.env.TENANT_STRICT;
    process.env.TENANT_STRICT = "1";
    try {
      const mod = await import("../../netlify/functions/lib/tenant.mjs");
      const tenant = await mod.resolveTenant(new Request("https://x/y")); // no auth header
      expect(tenant).toBeNull();
    } finally {
      if (prev == null) delete process.env.TENANT_STRICT;
      else process.env.TENANT_STRICT = prev;
      vi.resetModules();
    }
  });
});
