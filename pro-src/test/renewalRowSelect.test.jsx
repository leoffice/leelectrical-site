// @vitest-environment jsdom
// Regression — Levi 2026-08-12: tapping ONE Renewal Application row selected
// (expanded) ALL of them. Root cause: rows expand by card id, and the same
// permit # cached at two address spellings (Drive re-scan / cache upsert)
// produced identical `drive:<permitNo>` ids, so every matching row expanded
// together. listPendingRenewCards now guarantees unique row ids.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";
import { upsertPermitCacheEntries } from "../src/lib/permitCache.js";
import { listPendingRenewCards } from "../src/lib/permitRenewal.js";

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

// Same real permit # cached twice with different address spellings — the
// pending-list dedupe key (permitNo|address) keeps both rows, and before the
// fix both derived the same drive:<permitNo> id.
const DUP_ENTRIES = [
  {
    permitNo: "B09999999-L1-EL",
    address: "123 EASTERN PARKWAY",
    customer: "Dup One",
    email: "dup1@example.com",
    issuedDate: "2025-01-15",
    matchedCustomer: true,
    source: "drive:completed",
    sourceFolder: "completed",
    dobRenewable: true,
    dobRenewCheckStatus: "renewable",
    leviApproveNotify: true,
    notifyEligible: true,
  },
  {
    permitNo: "B09999999-L1-EL",
    address: "123 EASTERN PKWY",
    customer: "Dup Two",
    email: "dup2@example.com",
    issuedDate: "2025-01-15",
    matchedCustomer: true,
    source: "drive:completed",
    sourceFolder: "completed",
    dobRenewable: true,
    dobRenewCheckStatus: "renewable",
    leviApproveNotify: true,
    notifyEligible: true,
  },
];

describe("Renewal Application row selection (Levi 2026-08-12)", () => {
  it("pending card ids stay unique even when the cache holds the same permit twice", () => {
    upsertPermitCacheEntries(DUP_ENTRIES);
    const cards = listPendingRenewCards([]);
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Both duplicate-permit rows still show (separate rows, separate ids)
    const dupCards = cards.filter((c) => c.permitNo === "B09999999-L1-EL");
    expect(dupCards.length).toBe(2);
    expect(dupCards[0].id).not.toBe(dupCards[1].id);
    // Each row still carries its own scenario → its own customer email
    expect(dupCards.map((c) => c.email).sort()).toEqual([
      "dup1@example.com",
      "dup2@example.com",
    ]);
  });

  it("tapping one row expands exactly that row — never the whole list", async () => {
    mockServer({ settings: fullTenant, jobs: [], emailInsights: [] });
    upsertPermitCacheEntries(DUP_ENTRIES);
    renderAppAsTenant("#/permits");
    await screen.findByTestId("permits-tab");

    const toggle = await screen.findByTestId("renewal-application-toggle");
    await act(async () => {
      toggle.click();
    });

    const rows = await screen.findAllByTestId("permit-renew-app-row");
    const dupRows = rows.filter((r) =>
      /EASTERN P(ARKWAY|KWY)/.test(r.textContent || "")
    );
    expect(dupRows.length).toBe(2);

    await act(async () => {
      dupRows[0].querySelector("button").click();
    });

    expect(screen.queryAllByTestId("permit-renew-app-detail").length).toBe(1);
  });
});
