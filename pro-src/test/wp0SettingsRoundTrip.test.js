// WP0 contract: Settings POST must persist the tenant_config `tenant` block
// (branding + moduleOverrides) AND keep plan/internal server-authoritative.
// Exercises the real default-export handler over an in-memory store so the
// round-trip is proven without touching production KV.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared in-memory store so a POST and a following GET see the same state.
const mem = new Map();
const memStore = {
  async get(key) {
    return mem.has(key) ? JSON.parse(mem.get(key)) : null;
  },
  async setJSON(key, doc) {
    mem.set(key, JSON.stringify(doc));
  },
};

vi.mock("../../netlify/functions/lib/storage/index.mjs", () => ({
  getStore: () => memStore,
  rotateJsonBackup: async (store, baseKey, nextDoc) => {
    await store.setJSON(baseKey, nextDoc);
  },
}));
// settings.mjs imports rotateJsonBackup from ./blob-backup.mjs (re-export).
vi.mock("../../netlify/functions/blob-backup.mjs", () => ({
  rotateJsonBackup: async (store, baseKey, nextDoc) => {
    await store.setJSON(baseKey, nextDoc);
  },
}));

const MOD = "../../netlify/functions/settings.mjs";

async function loadHandler(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import(MOD)).default;
}

function post(body) {
  return new Request("http://x/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get() {
  return new Request("http://x/settings", { method: "GET" });
}

beforeEach(() => mem.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("WP0 — tenant_config round-trip via the POST handler", () => {
  it("persists branding + moduleOverrides and returns them on GET", async () => {
    const handler = await loadHandler({ TENANT_ID: "le", TENANT_INTERNAL: "1" });
    // seed a stored full-tier plan
    mem.set(
      "tenant-settings-v1",
      JSON.stringify({ tenant: { plan: { tier: "full", crewAddon: true } } })
    );

    const saveRes = await handler(
      post({
        tenant: {
          branding: { primaryColor: "#ff0000", logoUrl: "data:image/png;base64,AAAA" },
          moduleOverrides: { reports: false, permits: true },
        },
      })
    );
    const saved = await saveRes.json();
    expect(saved.ok).toBe(true);
    expect(saved.tenant.branding.primaryColor).toBe("#ff0000");
    expect(saved.tenant.moduleOverrides).toEqual({ reports: false, permits: true });

    const readBack = await (await handler(get())).json();
    expect(readBack.tenant.branding.primaryColor).toBe("#ff0000");
    expect(readBack.tenant.branding.logoUrl).toBe("data:image/png;base64,AAAA");
    expect(readBack.tenant.moduleOverrides).toEqual({ reports: false, permits: true });
  });

  it("keeps plan server-authoritative — a client cannot downgrade/reset the tier", async () => {
    const handler = await loadHandler({ TENANT_ID: "le", TENANT_INTERNAL: "1" });
    mem.set(
      "tenant-settings-v1",
      JSON.stringify({ tenant: { plan: { tier: "full", crewAddon: true } } })
    );

    // client tries to sneak plan:free AND omit-then-reset; also tries internal:false
    const res = await handler(
      post({
        tenant: {
          plan: { tier: "free", crewAddon: false },
          internal: false,
          branding: { primaryColor: "#123456" },
          moduleOverrides: { reports: true },
        },
      })
    );
    const out = (await res.json()).tenant;
    expect(out.plan.tier).toBe("full"); // stored plan preserved, client value ignored
    expect(out.plan.crewAddon).toBe(true);
    expect(out.internal).toBe(true); // env-authoritative
    expect(out.branding.primaryColor).toBe("#123456"); // branding still persisted
  });

  it("does not reset a non-le tenant's plan when the client saves only branding", async () => {
    const handler = await loadHandler({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    // acme is on 'pro' — the exact reset-bug scenario WP0 fixes
    mem.set(
      "tenant-settings-v1",
      JSON.stringify({ tenant: { plan: { tier: "pro", crewAddon: false } } })
    );

    const res = await handler(
      post({ tenant: { branding: { primaryColor: "#00ff00" }, moduleOverrides: {} } })
    );
    const out = (await res.json()).tenant;
    expect(out.plan.tier).toBe("pro"); // NOT reset to free
    expect(out.internal).toBe(false);
    expect(out.branding.primaryColor).toBe("#00ff00");
  });
});
