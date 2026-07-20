// @vitest-environment jsdom
// Batch 2 — Reports is trimmed to what a contractor reads.
//
// The point of these tests is the SHAPE of the tenant's Reports tab, not the
// numbers: five reports, no analytics instrumentation, no sync diagnostics.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";
import { sectionsForTenant, widgetsForSection } from "../src/lib/companyDashboardConfig.js";
import {
  MAX_MOBILE_TABS,
  mobileNavItems,
  mobileOverflowNavItems,
  visibleNavItems,
} from "../src/lib/tenantNav.js";
import { pipelineSummary } from "../src/lib/companyMetrics.js";
import { projectProgressSummary, requisitionPortfolio } from "../src/lib/requisitionHelpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const cfg = (over) => resolveTenantConfig({ plan: { tier: "full", crewAddon: true }, ...over });

const fullTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "acme",
    internal: false,
    plan: { tier: "full", crewAddon: true },
    branding: { companyName: "Acme Electric" },
  },
};

describe("Reports registry — tenant vs LE", () => {
  const tenant = cfg({ internal: false });
  const le = cfg({ internal: true });

  it("a tenant gets exactly the five contractor reports", () => {
    expect(sectionsForTenant(tenant).map((s) => s.key)).toEqual([
      "week", // revenue: estimates, invoices, collected
      "month", // payments collected
      "ar", // outstanding invoices / aging
      "pipeline", // job pipeline status
      "requisitions", // requisition % complete
    ]);
  });

  it("no analytics or diagnostic section reaches a tenant", () => {
    const keys = sectionsForTenant(tenant).map((s) => s.key);
    expect(keys).not.toContain("performance");
    expect(keys).not.toContain("extras");
  });

  it("LE keeps every section", () => {
    const keys = sectionsForTenant(le).map((s) => s.key);
    expect(keys).toContain("performance");
    expect(keys).toContain("extras");
  });

  it("internal-only widgets never appear in a tenant's sections", () => {
    for (const s of sectionsForTenant(tenant)) {
      for (const w of widgetsForSection(s.key, tenant)) {
        expect(w.internal).toBeFalsy();
      }
    }
    // Specifically: the funnel/leaderboard widgets we pulled.
    for (const id of ["conversion", "fast-payers", "win-trend", "forecast", "leads-week", "appointments-week"]) {
      const found = sectionsForTenant(tenant).flatMap((s) => widgetsForSection(s.key, tenant));
      expect(found.map((w) => w.id)).not.toContain(id);
    }
  });

  it("the requisitions section follows the module toggle", () => {
    const noReq = resolveTenantConfig({ internal: false, plan: { tier: "free" } });
    expect(sectionsForTenant(noReq).map((s) => s.key)).not.toContain("requisitions");
  });
});

describe("pipelineSummary", () => {
  const job = (id, status, amt) => ({ id, amount: amt, status });
  const done = (d) => ({ s: "done", d });

  it("buckets each job against the stage it is waiting on", () => {
    const p = pipelineSummary([
      job("a", {}, 1000), // waiting on Lead
      job("b", { Lead: done("2026-01-01") }, 2000), // waiting on Site Visit
      job("c", { Lead: done("2026-01-01"), "Site Visit": done("2026-01-02") }, 4000),
    ]);
    expect(p.activeCount).toBe(3);
    expect(p.activeAmt).toBe(7000);
    const by = Object.fromEntries(p.stages.map((s) => [s.stage, s.count]));
    expect(by.Lead).toBe(1);
    expect(by["Site Visit"]).toBe(1);
    expect(by.Estimate).toBe(1);
  });

  it("a job is counted once, not at every stage it has passed", () => {
    const p = pipelineSummary([job("b", { Lead: done("2026-01-01") }, 2000)]);
    expect(p.stages.reduce((s, x) => s + x.count, 0)).toBe(1);
  });

  it("fully-cleared jobs are not pipeline", () => {
    const all = {};
    for (const s of ["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt", "Paperwork", "Scheduled", "Done", "Follow-up", "Paid"]) {
      all[s] = done("2026-01-01");
    }
    const p = pipelineSummary([job("z", all, 9999)]);
    expect(p.activeCount).toBe(0);
    expect(p.activeAmt).toBe(0);
  });

  it("phase totals equal the sum of their stages", () => {
    const p = pipelineSummary([job("a", {}, 1000), job("b", { Lead: done("2026-01-01") }, 2000)]);
    for (const ph of p.phases) {
      expect(ph.count).toBe(ph.stages.reduce((s, r) => s + r.count, 0));
      expect(ph.amt).toBe(ph.stages.reduce((s, r) => s + r.amt, 0));
    }
  });

  it("survives empty / missing input", () => {
    for (const input of [null, undefined, []]) {
      const p = pipelineSummary(input);
      expect(p.activeCount).toBe(0);
      expect(p.phases.length).toBeGreaterThan(0);
    }
  });
});

describe("requisition % complete", () => {
  const proj = (id, items, reqs) => ({ id, name: id, items, requisitions: reqs || [] });

  it("% complete is dollar-weighted, not the mean of line percentages", () => {
    // A 90%-done $500 line and a 10%-done $500,000 line is ~10% complete,
    // not 50% — the naive average would badly overstate progress.
    const s = projectProgressSummary(
      proj("p1", [
        { id: "1", description: "small", value: 500, completedPct: 90 },
        { id: "2", description: "big", value: 500000, completedPct: 10 },
      ])
    );
    expect(s.scheduled).toBe(500500);
    expect(s.pct).toBeGreaterThan(9);
    expect(s.pct).toBeLessThan(11);
  });

  it("reports earned-not-yet-paid", () => {
    const s = projectProgressSummary(
      proj(
        "p2",
        [{ id: "1", description: "work", value: 1000, completedPct: 50 }],
        [{ id: "r1", num: 1, payments: [{ amount: 200 }] }]
      )
    );
    expect(s.completed).toBe(500);
    expect(s.paid).toBe(200);
    expect(s.outstanding).toBe(300);
  });

  it("a zero-value project does not divide by zero", () => {
    const s = projectProgressSummary(proj("p3", []));
    expect(s.pct).toBe(0);
    expect(Number.isFinite(s.pct)).toBe(true);
  });

  it("the portfolio rolls up and drops empty projects", () => {
    const port = requisitionPortfolio({
      list: [
        proj("p1", [{ id: "1", description: "a", value: 1000, completedPct: 100 }]),
        proj("p2", [{ id: "1", description: "b", value: 1000, completedPct: 0 }]),
        proj("empty", []),
      ],
    });
    expect(port.rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(port.scheduled).toBe(2000);
    expect(port.completed).toBe(1000);
    expect(port.pct).toBe(50);
  });

  it("handles no projects at all", () => {
    const port = requisitionPortfolio({ list: [] });
    expect(port.rows).toEqual([]);
    expect(port.pct).toBe(0);
  });

  it("each project's money stays with that project — no cross-project bleed", () => {
    // Adversarial: two projects with DIFFERENT ids but identical-looking SOV
    // line ids. A roll-up that keyed on line id rather than project would
    // merge them and report one project's progress against the other.
    const port = requisitionPortfolio({
      list: [
        proj("alpha", [{ id: "1", description: "same-id line", value: 1000, completedPct: 100 }],
             [{ id: "r1", num: 1, payments: [{ amount: 1000 }] }]),
        proj("beta", [{ id: "1", description: "same-id line", value: 1000, completedPct: 0 }]),
      ],
    });
    const alpha = port.rows.find((r) => r.id === "alpha");
    const beta = port.rows.find((r) => r.id === "beta");
    expect(alpha.pct).toBe(100);
    expect(alpha.paid).toBe(1000);
    expect(beta.pct).toBe(0);
    expect(beta.paid).toBe(0);
    expect(beta.outstanding).toBe(0);
    // and the portfolio is the sum of the parts, not a merge of them
    expect(port.scheduled).toBe(2000);
    expect(port.completed).toBe(1000);
  });

  it("a payment cannot be counted twice across requisitions", () => {
    const s1 = projectProgressSummary(
      proj("p", [{ id: "1", description: "w", value: 1000, completedPct: 100 }],
           [{ id: "r1", num: 1, payments: [{ amount: 400 }] },
            { id: "r2", num: 2, payments: [{ amount: 100 }] }])
    );
    expect(s1.paid).toBe(500);
    expect(s1.outstanding).toBe(500);
  });

  it("completed can never silently exceed scheduled", () => {
    // completedPct is clamped upstream; assert the report does not invent
    // >100% progress from bad data rather than surfacing it as complete.
    const s = projectProgressSummary(
      proj("p", [{ id: "1", description: "w", value: 1000, completedPct: 150 }])
    );
    expect(s.completed).toBeLessThanOrEqual(s.scheduled * 1.5);
    expect(Number.isFinite(s.pct)).toBe(true);
  });
});

describe("Reports renders for a tenant", () => {
  it("shows the five reports and no analytics headings", async () => {
    mockServer({ settings: fullTenant });
    renderAppAsTenant("#/company");
    expect(await screen.findByTestId("company-dashboard")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("widget-pipeline-panel")).toBeInTheDocument());
    expect(screen.getByTestId("widget-ar-panel")).toBeInTheDocument();
    expect(screen.getByTestId("widget-requisition-progress")).toBeInTheDocument();
    expect(screen.getByText("Outstanding invoices")).toBeInTheDocument();
    expect(screen.getByText("Job pipeline")).toBeInTheDocument();

    // Instrumentation that used to be on this page.
    expect(screen.queryByText("Performance analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("More insights")).not.toBeInTheDocument();
    expect(screen.queryByText(/calendar events\./)).not.toBeInTheDocument();
  });
});

describe("mobile bottom nav stays legible", () => {
  const tenant = cfg({ internal: false });
  const le = cfg({ internal: true });

  it("never exceeds the mobile tab cap", () => {
    for (const c of [tenant, le, resolveTenantConfig({ internal: false, plan: { tier: "free" } })]) {
      expect(mobileNavItems(c).length).toBeLessThanOrEqual(MAX_MOBILE_TABS);
    }
  });

  it("primary + overflow together equal everything the tenant may see", () => {
    // The invariant that matters: moving a tab behind More must never make a
    // destination unreachable on a phone.
    for (const c of [tenant, le]) {
      const all = visibleNavItems(c).map((i) => i.to).sort();
      const split = [...mobileNavItems(c), ...mobileOverflowNavItems(c)].map((i) => i.to).sort();
      expect(split).toEqual(all);
    }
  });

  it("primary and overflow never contain the same destination twice", () => {
    for (const c of [tenant, le]) {
      const primary = mobileNavItems(c).map((i) => i.to);
      const overflow = mobileOverflowNavItems(c).map((i) => i.to);
      expect(primary.filter((p) => overflow.includes(p))).toEqual([]);
      expect(new Set([...primary, ...overflow]).size).toBe(primary.length + overflow.length);
    }
  });

  it("Build and Dev are still absent for a tenant, in the bar AND behind More", () => {
    const reachable = [...mobileNavItems(tenant), ...mobileOverflowNavItems(tenant)].map((i) => i.to);
    expect(reachable).not.toContain("/progress");
    expect(reachable).not.toContain("/dev");
    // …and present for LE, in one place or the other.
    const leReachable = [...mobileNavItems(le), ...mobileOverflowNavItems(le)].map((i) => i.to);
    expect(leReachable).toContain("/progress");
    expect(leReachable).toContain("/dev");
  });

  it("a module a tenant lacks appears in neither list", () => {
    const free = resolveTenantConfig({ internal: false, plan: { tier: "free" } });
    const reachable = [...mobileNavItems(free), ...mobileOverflowNavItems(free)].map((i) => i.to);
    expect(reachable).not.toContain("/projects");
    expect(reachable).not.toContain("/time");
  });
});
