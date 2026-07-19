import { describe, expect, it } from "vitest";
import {
  LE_TENANT_SEED,
  MODULES,
  isInternal,
  isModuleEnabled,
  resolveModules,
  resolveTenantConfig,
} from "../src/lib/tenantConfig.js";
import {
  allowedRoutePaths,
  isRouteAllowed,
  visibleNavItems,
} from "../src/lib/tenantNav.js";

const tenant = (over = {}) =>
  resolveTenantConfig({ tenantId: "acme", internal: false, ...over });

describe("plan tiers", () => {
  it("free tier gets only invoicing + estimates", () => {
    const m = resolveModules({ plan: { tier: "free" } });
    expect(m.invoicing).toBe(true);
    expect(m.estimates).toBe(true);
    expect(m.requisitions).toBe(false);
    expect(m.permits).toBe(false);
    expect(m.reports).toBe(false);
  });

  it("pro adds requisitions, quickbooks and reports but not permits", () => {
    const m = resolveModules({ plan: { tier: "pro" } });
    expect(m.requisitions).toBe(true);
    expect(m.quickbooks).toBe(true);
    expect(m.reports).toBe(true);
    expect(m.permits).toBe(false);
    expect(m.documents).toBe(false);
  });

  it("full adds permits and documents", () => {
    const m = resolveModules({ plan: { tier: "full" } });
    expect(m.permits).toBe(true);
    expect(m.documents).toBe(true);
  });

  it("an unknown tier falls back to free rather than opening everything", () => {
    const m = resolveModules({ plan: { tier: "enterprise" } });
    expect(m).toEqual(resolveModules({ plan: { tier: "free" } }));
  });
});

describe("crew add-on", () => {
  it("is off on every tier by default — it is a paid add-on", () => {
    for (const tier of ["free", "pro", "full"]) {
      expect(resolveModules({ plan: { tier } }).crew).toBe(false);
    }
  });

  it("turns on when crewAddon is set, even on free", () => {
    expect(resolveModules({ plan: { tier: "free", crewAddon: true } }).crew).toBe(true);
  });
});

describe("module overrides", () => {
  it("can grant a module above the tier", () => {
    const m = resolveModules({ plan: { tier: "pro" }, moduleOverrides: { permits: true } });
    expect(m.permits).toBe(true);
  });

  it("can revoke a module below the tier", () => {
    const m = resolveModules({ plan: { tier: "full" }, moduleOverrides: { documents: false } });
    expect(m.documents).toBe(false);
  });

  it("ignores unknown keys", () => {
    const m = resolveModules({ plan: { tier: "free" }, moduleOverrides: { wormhole: true } });
    expect(m.wormhole).toBeUndefined();
  });
});

describe("internal flag", () => {
  it("turns every module on regardless of tier or overrides", () => {
    const m = resolveModules({
      plan: { tier: "free" },
      moduleOverrides: { requisitions: false },
      internal: true,
    });
    for (const key of MODULES) expect(m[key]).toBe(true);
  });

  it("defaults to false for a tenant record that omits it", () => {
    expect(isInternal(tenant())).toBe(false);
  });

  it("is true for the LE flagship seed, with every module on", () => {
    const le = resolveTenantConfig(LE_TENANT_SEED);
    expect(isInternal(le)).toBe(true);
    for (const key of MODULES) expect(isModuleEnabled(le, key)).toBe(true);
  });
});

describe("agency presets", () => {
  it("ships NYC DOB + Con Edison for the LE tenant", () => {
    const le = resolveTenantConfig(LE_TENANT_SEED);
    expect(le.agencies.map((a) => a.id)).toEqual(["dob", "coned"]);
  });

  it("normalizes bare strings into id/label pairs", () => {
    const c = tenant({ agencies: ["City of Chicago DOB", "ComEd"] });
    expect(c.agencies).toEqual([
      { id: "city_of_chicago_dob", label: "City of Chicago DOB" },
      { id: "comed", label: "ComEd" },
    ]);
  });
});

describe("route stripping — the golden rule", () => {
  it("a disabled module's routes are not registered at all", () => {
    const free = tenant({ plan: { tier: "free" } });
    // Requisitions is off on free — neither the list nor the detail URL exists.
    expect(isRouteAllowed("/projects", free)).toBe(false);
    expect(isRouteAllowed("/projects/:projectId", free)).toBe(false);
    expect(isRouteAllowed("/company", free)).toBe(false); // reports
    expect(isRouteAllowed("/time", free)).toBe(false); // crew
  });

  it("nav and routes agree — nothing hidden-but-reachable", () => {
    for (const tier of ["free", "pro", "full"]) {
      const c = tenant({ plan: { tier } });
      const paths = allowedRoutePaths(c);
      const navTos = visibleNavItems(c).map((i) => i.to);
      // Every nav link points at a registered route.
      for (const to of navTos) expect(paths).toContain(to);
      // And every gateable registered route has a nav link (core routes aside).
      for (const p of paths) {
        if (p === "/job/:id" || p === "/customer/:key") continue;
        if (p.startsWith("/projects/")) continue; // detail route, no own link
        expect(navTos).toContain(p);
      }
    }
  });

  it("dev routes are absent for a non-internal tenant on the top tier", () => {
    const full = tenant({ plan: { tier: "full", crewAddon: true } });
    expect(isRouteAllowed("/dev", full)).toBe(false);
    expect(isRouteAllowed("/progress", full)).toBe(false);
    expect(visibleNavItems(full).map((i) => i.to)).not.toContain("/dev");
    expect(visibleNavItems(full).map((i) => i.to)).not.toContain("/progress");
  });

  it("dev routes are present for an internal tenant", () => {
    const le = resolveTenantConfig(LE_TENANT_SEED);
    expect(isRouteAllowed("/dev", le)).toBe(true);
    expect(isRouteAllowed("/progress", le)).toBe(true);
  });

  it("core routes stay registered on every tier", () => {
    for (const tier of ["free", "pro", "full"]) {
      const c = tenant({ plan: { tier } });
      for (const p of ["/", "/job/:id", "/customer/:key", "/settings", "/archive"]) {
        expect(isRouteAllowed(p, c)).toBe(true);
      }
    }
  });
});

describe("fail-closed defaults", () => {
  it("a null/garbage config yields no module access for a non-internal tenant", () => {
    const c = resolveTenantConfig({ tenantId: "acme", internal: false, plan: null });
    expect(c.plan.tier).toBe("free");
    expect(isModuleEnabled(c, "permits")).toBe(false);
  });

  it("isModuleEnabled denies unknown module keys", () => {
    expect(isModuleEnabled(tenant({ plan: { tier: "full" } }), "nope")).toBe(false);
    expect(isModuleEnabled(null, "invoicing")).toBe(false);
  });
});
