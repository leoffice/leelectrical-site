// @vitest-environment jsdom
// Integration — the Permits tab against the real App tree + tenant gating.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const freeTenant = {
  profile: {},
  features: {},
  tenant: { tenantId: "starter", internal: false, plan: { tier: "free", crewAddon: false }, branding: { companyName: "Starter Co" } },
};

// Full tier turns the permits module on without needing `internal`.
const fullTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "acme",
    internal: false,
    plan: { tier: "full", crewAddon: false },
    branding: { companyName: "Acme Electric" },
    agencies: [{ id: "coned", label: "Con Edison" }, { id: "dob", label: "DOB" }],
  },
};

const JOB = { id: "J-77", customer: "Winthrop Owner", serviceAddress: "417 Winthrop St", status: {} };

const conedInsight = {
  id: "ei-77",
  status: "auto_applied",
  agency: "coned",
  source: {
    from: "Con Edison <cpms.noreply@coned.com>",
    subject: "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
    receivedAt: "Wed, 22 Jul 2026 11:15:36 -0400",
    messageId: "m77",
  },
  dateTime: "2026-08-04T09:00",
  jobId: "J-77",
};

describe("Permits tab gating", () => {
  it("Free tenant typing /permits gets Not found (module off)", async () => {
    mockServer({ settings: freeTenant });
    renderAppAsTenant("#/permits");
    expect(await screen.findByText("That page doesn’t exist.")).toBeInTheDocument();
  });
});

describe("Permits tab renders derived Con Ed cases", () => {
  it("Full-tier tenant sees a Con Ed case row derived from an applied email", async () => {
    mockServer({ settings: fullTenant, jobs: [JOB], emailInsights: [conedInsight] });
    renderAppAsTenant("#/permits");
    // Case row shows the customer and the MC case number.
    expect(await screen.findByText("Winthrop Owner")).toBeInTheDocument();
    expect(await screen.findByText("MC-910413")).toBeInTheDocument();
    // The Con Ed section header is present.
    expect(await screen.findByTestId("permit-section-coned")).toBeInTheDocument();
  });
});
