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

  it("4k synthetic fat jobs compress dramatically when slimmed", () => {
    const fatJob = () => ({
      id: "j-" + Math.random().toString(36).slice(2),
      customer: "Customer Name LLC",
      address: "123 Main Street Brooklyn NY",
      amount: "$25000",
      invoiceNo: "251800",
      status: { Lead: { s: "done" }, Estimate: { s: "done" }, Invoiced: { s: "done" } },
      invoiceLines: Array.from({ length: 30 }, (_, i) => ({
        itemName: "Installation:Installation",
        description: "Long description of work item number " + i + " with scope and exclusions",
        amount: 100,
        quantity: 1,
        rate: 100,
      })),
      estimateLines: Array.from({ length: 20 }, (_, i) => ({
        itemName: "Service Upgrade",
        description: "SCOPE: meter " + i,
        amount: 200,
      })),
      payments: Array.from({ length: 15 }, (_, i) => ({
        id: "pay-" + i,
        amount: 500,
        method: "Zelle",
        note: "payment note " + i,
      })),
    });
    const jobs = Array.from({ length: 200 }, fatJob);
    const fatBytes = JSON.stringify({ jobs }).length;
    const slimBytes = JSON.stringify(slimJobsDoc({ jobs, ts: 1 })).length;
    // Slim must be under half of fat for this synthetic shape
    expect(slimBytes).toBeLessThan(fatBytes * 0.5);
    expect(slimBytes / jobs.length).toBeLessThan(2500); // < ~2.5KB/job target
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
