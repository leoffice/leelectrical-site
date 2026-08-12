// @vitest-environment jsdom
// Regression — Levi 2026-08-12: a history "Resend" whose scenario aged out of
// the permit cache used to fall back to the HAMPTON scenario and prefill
// another customer's permit content. renewScenarioById now returns null for
// unknown ids and the UI blocks the resend with a clear message.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";
import { appendRenewSendHistory } from "../src/lib/permitCache.js";
import {
  renewScenarioById,
  assertRenewComposeRecipient,
  materializeRenewInvoicePatch,
} from "../src/lib/permitRenewal.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const fullTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "acme",
    internal: false,
    plan: { tier: "full", crewAddon: false },
    moduleOverrides: { permits: true },
    branding: { companyName: "Acme Electric" },
    agencies: [
      { id: "coned", label: "Con Edison" },
      { id: "dob", label: "DOB" },
    ],
  },
};

describe("renewScenarioById unknown ids", () => {
  it("returns null for an id that is not in the cache — never Hampton", () => {
    const sc = renewScenarioById("drive:GONE-FROM-CACHE-99");
    expect(sc).toBeNull();
  });

  it("still resolves the ready Hampton scenario and legacy empty id", () => {
    expect(renewScenarioById("hampton-yossi")?.address).toMatch(/hampton/i);
    // Legacy phase-A mocks without a scenarioId are Hampton by definition
    expect(renewScenarioById("")?.address).toMatch(/hampton/i);
  });

  it("materializeRenewInvoicePatch survives an aged-out scenario", () => {
    const job = {
      id: "J-1",
      serviceAddress: "9 Somewhere St",
      permitRenew: {
        scenarioId: "drive:GONE-FROM-CACHE-99",
        placeholderInvoiceNo: "LE-777",
        address: "9 Somewhere St",
        permitNo: "B07777777-L1-EL",
        fee: 365,
      },
    };
    const patch = materializeRenewInvoicePatch(job, {});
    expect(patch.amount).toBe(365);
    expect(patch.invoiceLines?.length).toBeGreaterThan(0);
    const text = JSON.stringify(patch.invoiceLines);
    expect(text).toContain("9 Somewhere St");
    expect(text).not.toMatch(/hampton/i);
  });
});

describe("compose recipient accepts comma lists", () => {
  it("validates every address and normalizes the list", () => {
    const r = assertRenewComposeRecipient(
      "payables@rancomgmt.com, Louis@rancomgmt.com; louis@rancomgmt.com"
    );
    expect(r.ok).toBe(true);
    expect(r.recipients).toEqual([
      "payables@rancomgmt.com",
      "Louis@rancomgmt.com",
    ]);
    expect(r.email).toBe("payables@rancomgmt.com, Louis@rancomgmt.com");
  });

  it("rejects a list containing a non-address", () => {
    expect(assertRenewComposeRecipient("a@x.com, not-an-email").ok).toBe(false);
  });
});

describe("history Resend with aged-out scenario (UI)", () => {
  it("blocks the resend — no compose sheet, no Hampton prefill", async () => {
    mockServer({ settings: fullTenant, jobs: [], emailInsights: [] });
    appendRenewSendHistory({
      scenarioId: "drive:GONE-FROM-CACHE-99",
      permitNo: "B09876543-L1-EL",
      address: "77 Vanished Ave",
      customer: "Gone Customer",
      to: "gone@example.com",
    });
    renderAppAsTenant("#/permits");
    await screen.findByTestId("permits-tab");

    await act(async () => {
      (await screen.findByTestId("renewal-application-toggle")).click();
    });
    await act(async () => {
      (await screen.findByTestId("permit-renew-history-toggle")).click();
    });

    const resend = await screen.findByTestId("permit-renew-history-resend");
    await act(async () => {
      resend.click();
    });

    // No compose sheet — and specifically no Hampton content anywhere
    expect(
      screen.queryByTestId("renew-email-compose-sheet")
    ).not.toBeInTheDocument();
    // The block message surfaces (toast)
    expect(
      await screen.findByText(/no longer in the cache/i)
    ).toBeInTheDocument();
  });
});
