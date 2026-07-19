// Server-side tenant_config normalization.
//
// The property under test is a security one: `internal` unlocks the Build tab
// and every other dev surface, so it must come from the environment alone. A
// tenant POSTing { tenant: { internal: true } } must not be able to grant it
// to themselves.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOD = "../../netlify/functions/settings.mjs";

async function loadWith(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import(MOD);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("internal is server-authoritative", () => {
  it("ignores internal:true from a client payload on a non-internal tenant", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    const out = normalizeTenant({ internal: true, plan: { tier: "free" } });
    expect(out.internal).toBe(false);
  });

  it("keeps internal true for the LE deployment regardless of the payload", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "le", TENANT_INTERNAL: "1" });
    const out = normalizeTenant({ internal: false });
    expect(out.internal).toBe(true);
  });

  it("defaults a non-le tenant to non-internal when the var is unset", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme" });
    expect(normalizeTenant({}).internal).toBe(false);
  });

  it("forces the tenantId from the environment, not the payload", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    expect(normalizeTenant({ tenantId: "le" }).tenantId).toBe("acme");
  });
});

describe("plan and override normalization", () => {
  it("rejects an unknown tier", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    expect(normalizeTenant({ plan: { tier: "enterprise" } }).plan.tier).toBe("free");
  });

  it("drops unknown module override keys and non-booleans", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    const out = normalizeTenant({
      moduleOverrides: { permits: true, wormhole: true, reports: "yes" },
    });
    expect(out.moduleOverrides).toEqual({ permits: true });
  });

  it("normalizes agency strings into id/label pairs", async () => {
    const { normalizeTenant } = await loadWith({ TENANT_ID: "acme", TENANT_INTERNAL: "0" });
    expect(normalizeTenant({ agencies: ["ComEd"] }).agencies).toEqual([
      { id: "comed", label: "ComEd" },
    ]);
  });
});
