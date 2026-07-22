// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isQuickbooksEnabled, resolveDocSource } from "../src/lib/qboEnabled.js";
import {
  isQuickbooksFeatureEnabled,
  setQuickbooksFeatureEnabled,
} from "../src/lib/appSettings.js";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";

describe("qboEnabled", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveTenantConfig(resolveTenantConfig(null));
  });

  it("defaults QuickBooks feature on", () => {
    expect(isQuickbooksFeatureEnabled()).toBe(true);
    expect(isQuickbooksEnabled()).toBe(true);
  });

  it("feature off forces local-only even when module is on", () => {
    setQuickbooksFeatureEnabled(false);
    expect(isQuickbooksFeatureEnabled()).toBe(false);
    expect(isQuickbooksEnabled()).toBe(false);
    expect(resolveDocSource("qbo")).toBe("local");
    expect(resolveDocSource("local")).toBe("local");
  });

  it("feature on allows qbo source", () => {
    setQuickbooksFeatureEnabled(true);
    expect(resolveDocSource("qbo")).toBe("qbo");
  });

  it("plan free module disables QuickBooks even if feature on", () => {
    setQuickbooksFeatureEnabled(true);
    const free = resolveTenantConfig({
      tenantId: "x",
      internal: false,
      plan: { tier: "free" },
    });
    expect(isQuickbooksEnabled(free)).toBe(false);
  });

  it("explicit features object wins over localStorage", () => {
    setQuickbooksFeatureEnabled(true);
    expect(isQuickbooksEnabled(undefined, { quickbooks: false })).toBe(false);
    setQuickbooksFeatureEnabled(false);
    expect(isQuickbooksEnabled(undefined, { quickbooks: true })).toBe(true);
  });
});
