/**
 * Lag guardrails for the 4k-job list payload (Levi 2026-08-04).
 * List GET must not ship full invoice/estimate line arrays.
 */
import { describe, it, expect } from "vitest";
import { slimJob, slimJobsDoc } from "../../netlify/functions/jobsdata.mjs";

describe("jobsdata slim projection", () => {
  it("strips invoiceLines and estimateLines from list jobs", () => {
    const fat = {
      id: "qbo-1",
      customer: "Test",
      amount: "$100",
      invoiceLines: [{ itemName: "X", amount: 50 }, { itemName: "Y", amount: 50 }],
      estimateLines: [{ itemName: "E", amount: 10 }],
      payments: Array.from({ length: 20 }, (_, i) => ({ id: "p" + i, amount: 1 })),
      status: { Lead: { s: "done" } },
    };
    const s = slimJob(fat);
    expect(s.id).toBe("qbo-1");
    expect(s.customer).toBe("Test");
    expect(s.invoiceLines).toBeUndefined();
    expect(s.estimateLines).toBeUndefined();
    expect(s.payments.length).toBeLessThanOrEqual(4);
    expect(s._listProjection).toBe(true);
    expect(s._paymentsTruncated).toBe(true);
  });

  it("4k synthetic fat jobs compress dramatically when slimmed (pre-deploy gate)", () => {
    // Real benefit: fails the build if list projection ever re-grows fat.
    // Mirrors production scale (~4181 jobs) with heavy line arrays.
    const fatJob = (i) => ({
      id: "qbo-" + (16000 + i),
      customer: "Customer Name LLC " + i,
      address: "123 Main Street Brooklyn NY 11213",
      serviceAddress: "123 Main Street Brooklyn NY 11213",
      amount: "$25000",
      openBalance: "$5000",
      invoiceNo: String(251800 + i),
      status: {
        Lead: { s: "done", d: "2024-01-01", note: "extra" },
        Estimate: { s: "done", d: "2024-01-02" },
        Invoiced: { s: "done", d: "2024-01-03" },
        Paid: { s: "upcoming" },
      },
      invoiceLines: Array.from({ length: 25 }, (_, k) => ({
        itemName: "Installation:Installation",
        description: "Long description of work item number " + k + " with scope and exclusions " + i,
        amount: 100,
        quantity: 1,
        rate: 100,
      })),
      estimateLines: Array.from({ length: 15 }, (_, k) => ({
        itemName: "Service Upgrade",
        description: "SCOPE: meter " + k,
        amount: 200,
      })),
      payments: Array.from({ length: 12 }, (_, k) => ({
        id: "pay-" + i + "-" + k,
        amount: 500,
        method: "Zelle",
        note: "payment note with memo and deposit bank " + k,
        ref: "JPM" + i + k,
      })),
      payment: { id: "p0", amount: 500, method: "Zelle", note: "latest" },
      title: "Installation of wiring switches outlets lights and panels ".repeat(3),
    });
    const N = 4000;
    const jobs = Array.from({ length: N }, (_, i) => fatJob(i));
    const fatBytes = JSON.stringify({ jobs }).length;
    const slimBytes = JSON.stringify(slimJobsDoc({ jobs, ts: 1 })).length;
    // Must crush fat payloads; and stay under ~1.2KB/job average for this shape
    expect(slimBytes).toBeLessThan(fatBytes * 0.25);
    expect(slimBytes / N).toBeLessThan(1200);
    // Absolute ceiling: list payload for 4k must stay under 5 MB in this harness
    expect(slimBytes).toBeLessThan(5_000_000);
  });
});

describe("lag guardrails — Permits poll must not restart on jobs", () => {
  it("Permits.jsx fleet poll effect does not list jobs in dependency array", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve("src/views/Permits.jsx"),
      "utf8"
    );
    // The lag bug was: }, [enqueue, jobs]);
    expect(src).not.toMatch(/},\s*\[enqueue,\s*jobs\]\s*\)/);
    expect(src).toMatch(/jobsRef/);
  });
});
