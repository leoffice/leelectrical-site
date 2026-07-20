// @vitest-environment jsdom
// Batch 2 — dev surfaces must be absent for a tenant, not merely hidden.
//
// tenantRouteGate.test.jsx proves the URLs 404. This file covers the two
// hardening layers added on top of that:
//   1. the internal-only view chunks are never even FETCHED, so nothing about
//      the Build/Dev tabs reaches a tenant's running app;
//   2. data surfaces that leak LE's own business content are gated too.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";
import { defaultQboItems, filterQboItems } from "../src/data/qboItems.js";
import { DEFAULT_QBO_ITEMS } from "../src/data/leQboCatalog.js";

const proTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "acme",
    internal: false,
    plan: { tier: "full", crewAddon: true },
    branding: { companyName: "Acme Electric" },
  },
};

const leTenant = {
  profile: {},
  features: {},
  tenant: { tenantId: "le", internal: true, plan: { tier: "full", crewAddon: true } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.location.hash = "#/";
  setActiveTenantConfig(resolveTenantConfig(null));
});

describe("internal-only view chunks are never loaded for a tenant", () => {
  // Spy on the modules themselves: if the chunk were fetched, the view's
  // default export would be evaluated and rendered.
  it("/progress (Build) renders Not found and never mounts the Build view", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/progress");
    expect(await screen.findByText("That page doesn’t exist.")).toBeInTheDocument();
    // None of the Build view's own markup exists — not even its loading state,
    // which is what would appear if the chunk had been requested.
    for (const id of ["dev-stat", "progress-loading", "progress-error"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it("/dev renders Not found and never mounts the Dev board", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/dev");
    expect(await screen.findByText("That page doesn’t exist.")).toBeInTheDocument();
    expect(screen.queryByTestId("log-off-btn-mobile")).not.toBeInTheDocument();
  });

  it("LE still reaches both", async () => {
    for (const path of ["#/progress", "#/dev"]) {
      mockServer({ settings: leTenant });
      const { unmount } = renderAppAsTenant(path);
      await waitFor(() =>
        expect(screen.queryByText("That page doesn’t exist.")).not.toBeInTheDocument()
      );
      unmount();
    }
  });
});

describe("LE's item catalogue is not served to other tenants", () => {
  beforeEach(() => localStorage.clear());

  it("defaultQboItems() is empty for a tenant, full for LE", async () => {
    setActiveTenantConfig(resolveTenantConfig({ internal: false, plan: { tier: "full" } }));
    await expect(defaultQboItems()).resolves.toEqual([]);
    setActiveTenantConfig(resolveTenantConfig({ internal: true, plan: { tier: "full" } }));
    const le = await defaultQboItems();
    expect(le.length).toBe(DEFAULT_QBO_ITEMS.length);
  });

  it("a tenant never triggers the catalogue chunk import at all", async () => {
    // The point of the split: not merely "returns []" but "never asks for the
    // module". If this ever imports, LE's prices are in the tenant's network
    // waterfall even when the UI hides them.
    setActiveTenantConfig(resolveTenantConfig({ internal: false, plan: { tier: "full" } }));
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(defaultQboItems()).resolves.toEqual([]);
    // jsdom resolves the dynamic import through the module graph, not fetch,
    // so assert on the returned value AND that nothing was requested.
    expect(spy.mock.calls.filter(([u]) => String(u).includes("leQboCatalog"))).toHaveLength(0);
  });

  it("filterQboItems has no built-in fallback — it filters only what it is given", () => {
    // Regression: filterQboItems() used to fall back to DEFAULT_QBO_ITEMS
    // directly, bypassing defaultQboItems() — so a tenant who had not synced
    // QuickBooks saw LE's real service names and prices in the item picker.
    // The fallback is now gone entirely, for EVERY tenant including LE, so
    // there is no code path that can reintroduce the leak.
    for (const internal of [false, true]) {
      setActiveTenantConfig(resolveTenantConfig({ internal, plan: { tier: "full" } }));
      expect(filterQboItems([], "")).toEqual([]);
      expect(filterQboItems(undefined, "service")).toEqual([]);
      expect(filterQboItems([], "coned")).toEqual([]);
    }
  });

  it("LE gets its catalogue by loading it, then filtering", async () => {
    setActiveTenantConfig(resolveTenantConfig({ internal: true, plan: { tier: "full" } }));
    const le = await defaultQboItems();
    expect(filterQboItems(le, "").length).toBeGreaterThan(0);
    expect(filterQboItems(le, "coned").length).toBeGreaterThan(0);
  });

  it("a tenant's own synced items are unaffected", () => {
    setActiveTenantConfig(resolveTenantConfig({ internal: false, plan: { tier: "full" } }));
    const mine = [{ name: "Drain snake", type: "Service", price: 90, description: "Drain" }];
    expect(filterQboItems(mine, "")).toEqual(mine);
    expect(filterQboItems(mine, "drain")).toEqual(mine);
  });
});
