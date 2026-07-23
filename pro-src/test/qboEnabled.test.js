// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  isQuickbooksDocsEnabled,
  isQuickbooksEnabled,
  resolveDocSource,
} from "../src/lib/qboEnabled.js";
import {
  isQuickbooksDocsFeatureEnabled,
  isQuickbooksFeatureEnabled,
  setQuickbooksDocsFeatureEnabled,
  setQuickbooksFeatureEnabled,
} from "../src/lib/appSettings.js";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";

describe("qboEnabled", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveTenantConfig(resolveTenantConfig(null));
  });

  it("defaults integration on and send/view docs off", () => {
    expect(isQuickbooksFeatureEnabled()).toBe(true);
    expect(isQuickbooksDocsFeatureEnabled()).toBe(false);
    expect(isQuickbooksEnabled()).toBe(true);
    expect(isQuickbooksDocsEnabled()).toBe(false);
    expect(resolveDocSource("qbo")).toBe("local");
  });

  it("feature off forces local-only even when module is on", () => {
    setQuickbooksFeatureEnabled(false);
    expect(isQuickbooksFeatureEnabled()).toBe(false);
    expect(isQuickbooksEnabled()).toBe(false);
    expect(isQuickbooksDocsEnabled()).toBe(false);
    expect(resolveDocSource("qbo")).toBe("local");
    expect(resolveDocSource("local")).toBe("local");
  });

  it("docs off keeps integration but forces local send/view", () => {
    setQuickbooksFeatureEnabled(true);
    setQuickbooksDocsFeatureEnabled(false);
    expect(isQuickbooksEnabled()).toBe(true);
    expect(isQuickbooksDocsEnabled()).toBe(false);
    expect(resolveDocSource("qbo")).toBe("local");
    expect(resolveDocSource("local")).toBe("local");
  });

  it("docs on allows qbo source", () => {
    setQuickbooksFeatureEnabled(true);
    setQuickbooksDocsFeatureEnabled(true);
    expect(isQuickbooksDocsEnabled()).toBe(true);
    expect(resolveDocSource("qbo")).toBe("qbo");
  });

  it("plan free module disables QuickBooks even if feature on", () => {
    setQuickbooksFeatureEnabled(true);
    setQuickbooksDocsFeatureEnabled(true);
    const free = resolveTenantConfig({
      tenantId: "x",
      internal: false,
      plan: { tier: "free" },
    });
    expect(isQuickbooksEnabled(free)).toBe(false);
    expect(isQuickbooksDocsEnabled(free)).toBe(false);
  });

  it("explicit features object wins over localStorage", () => {
    setQuickbooksFeatureEnabled(true);
    setQuickbooksDocsFeatureEnabled(true);
    expect(isQuickbooksEnabled(undefined, { quickbooks: false })).toBe(false);
    expect(isQuickbooksDocsEnabled(undefined, { quickbooks: true, quickbooksDocs: false })).toBe(
      false
    );
    setQuickbooksFeatureEnabled(false);
    expect(isQuickbooksEnabled(undefined, { quickbooks: true })).toBe(true);
    expect(
      isQuickbooksDocsEnabled(undefined, { quickbooks: true, quickbooksDocs: true })
    ).toBe(true);
  });
});
