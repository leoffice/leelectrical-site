// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  isQuickbooksDocEnabled,
  isQuickbooksDocsEnabled,
  isQuickbooksEnabled,
  resolveDocSource,
} from "../src/lib/qboEnabled.js";
import {
  isQuickbooksDocsFeatureEnabled,
  isQuickbooksFeatureEnabled,
  setQuickbooksDocFeatureEnabled,
  setQuickbooksDocsFeatureEnabled,
  setQuickbooksFeatureEnabled,
} from "../src/lib/appSettings.js";
import { mergeFeatures, quickbooksDocFeature } from "../src/lib/tenantProfile.js";
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

  // ── invoices vs estimates are separate send switches (Levi 2026-07-27) ──

  it("sends invoices through QB while estimates stay local", () => {
    const features = {
      quickbooks: true,
      quickbooksInvoices: true,
      quickbooksEstimates: false,
    };
    expect(isQuickbooksEnabled(undefined, features)).toBe(true);
    expect(isQuickbooksDocEnabled("invoice", undefined, features)).toBe(true);
    expect(isQuickbooksDocEnabled("estimate", undefined, features)).toBe(false);
    // Shared "is any QB doc path live" chrome stays on.
    expect(isQuickbooksDocsEnabled(undefined, features)).toBe(true);
    expect(resolveDocSource("qbo", undefined, "invoice")).toBe("local"); // localStorage path
    expect(resolveDocSource("qbo", undefined, "estimate")).toBe("local");
  });

  it("sync on with both send switches off keeps every document local", () => {
    const features = {
      quickbooks: true,
      quickbooksInvoices: false,
      quickbooksEstimates: false,
    };
    expect(isQuickbooksEnabled(undefined, features)).toBe(true);
    expect(isQuickbooksDocEnabled("invoice", undefined, features)).toBe(false);
    expect(isQuickbooksDocEnabled("estimate", undefined, features)).toBe(false);
    expect(isQuickbooksDocsEnabled(undefined, features)).toBe(false);
  });

  it("sync off wins over both send switches", () => {
    const features = {
      quickbooks: false,
      quickbooksInvoices: true,
      quickbooksEstimates: true,
    };
    expect(isQuickbooksDocEnabled("invoice", undefined, features)).toBe(false);
    expect(isQuickbooksDocEnabled("estimate", undefined, features)).toBe(false);
  });

  it("a config saved before the split keeps sending exactly what it sent", () => {
    // Legacy tenants carry only `quickbooksDocs`; it seeds both kinds.
    const legacyOn = { quickbooks: true, quickbooksDocs: true };
    expect(quickbooksDocFeature(legacyOn, "invoice")).toBe(true);
    expect(quickbooksDocFeature(legacyOn, "estimate")).toBe(true);
    expect(mergeFeatures(legacyOn).quickbooksEstimates).toBe(true);

    const legacyOff = { quickbooks: true, quickbooksDocs: false };
    expect(quickbooksDocFeature(legacyOff, "invoice")).toBe(false);
    expect(quickbooksDocFeature(legacyOff, "estimate")).toBe(false);
    expect(isQuickbooksDocEnabled("invoice", undefined, legacyOff)).toBe(false);
  });

  it("per-device switches drive the localStorage path", () => {
    setQuickbooksFeatureEnabled(true);
    setQuickbooksDocFeatureEnabled("invoice", true);
    setQuickbooksDocFeatureEnabled("estimate", false);
    expect(isQuickbooksDocEnabled("invoice")).toBe(true);
    expect(isQuickbooksDocEnabled("estimate")).toBe(false);
    expect(resolveDocSource("qbo", undefined, "invoice")).toBe("qbo");
    expect(resolveDocSource("qbo", undefined, "estimate")).toBe("local");
    // Unset per-doc keys fall back to the umbrella.
    localStorage.removeItem("lepro_feature_quickbooks_invoices");
    localStorage.removeItem("lepro_feature_quickbooks_estimates");
    setQuickbooksDocsFeatureEnabled(true);
    expect(isQuickbooksDocEnabled("invoice")).toBe(true);
    expect(isQuickbooksDocEnabled("estimate")).toBe(true);
  });
});
