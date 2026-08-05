/**
 * Lag guardrails for the 4k-job list payload (Levi 2026-08-04).
 * List GET must not ship full invoice/estimate line arrays.
 */
import { describe, it, expect } from "vitest";
import { slimJob, slimJobsDoc } from "../../netlify/functions/jobsdata.mjs";

describe("jobsdata slim projection", () => {
  it("strips invoiceLines, payments, empty stages, and addresses from list jobs", () => {
    const fat = {
      id: "qbo-1",
      customer: "Test",
      amount: "$100",
      openBalance: "$50",
      address: "1 Main",
      serviceAddress: "1 Main",
      billingAddress: "PO Box",
      invoiceNo: "231409",
      invoiceDate: "2023-11-27",
      estimateDate: "2023-11-01",
      dueDate: "2023-11-28",
      invoiceLines: [{ itemName: "X", amount: 50 }, { itemName: "Y", amount: 50 }],
      estimateLines: [{ itemName: "E", amount: 10 }],
      payments: Array.from({ length: 20 }, (_, i) => ({ id: "p" + i, amount: 1 })),
      payment: { id: "p0", amount: 1, method: "Zelle" },
      status: {
        Lead: { s: "done", d: "2024-01-01", note: "x" },
        Estimate: { s: "skipped" },
        Invoiced: { s: "" },
        Paid: { s: "" },
      },
    };
    const s = slimJob(fat);
    expect(s.id).toBe("qbo-1");
    expect(s.customer).toBe("Test");
    // Dates stay on list so Job Info / aging / PDF never invent "today"
    expect(s.invoiceDate).toBe("2023-11-27");
    expect(s.estimateDate).toBe("2023-11-01");
    expect(s.dueDate).toBe("2023-11-28");
    expect(s.invoiceLines).toBeUndefined();
    expect(s.estimateLines).toBeUndefined();
    expect(s.payments).toBeUndefined();
    expect(s.payment).toBeUndefined();
    expect(s.serviceAddress).toBeUndefined();
    expect(s.billingAddress).toBeUndefined();
    expect(s.status.Lead).toEqual({ s: "done" });
    expect(s.status.Estimate).toEqual({ s: "skipped" });
    expect(s.status.Invoiced).toBeUndefined();
    expect(s._listProjection).toBe(true);
  });

  it("keeps cheap appsReady + case number on list without shipping full Form A files", () => {
    const fat = {
      id: "local-apps",
      customer: "Goodness",
      address: "1337 President",
      paperwork: {
        coned: {
          enabled: true,
          caseNumber: "MC-941580",
          completedFiles: [
            { name: "1337 PLP.pdf", status: "customer_submitted", docKey: "x" },
            { name: "done.pdf", status: "uploaded", uploadedAt: "2026-08-01" },
          ],
        },
        todos: [
          {
            id: "upload_application:PLP",
            kind: "upload_application",
            status: "pending",
            note: "FILE READY",
          },
        ],
      },
      permitTracker: true,
    };
    const s = slimJob(fat);
    expect(s.appsReady).toBe(1);
    expect(s.conedCaseNumber).toBe("MC-941580");
    expect(s.permitTracker).toBe(true);
    expect(s.paperwork).toBeUndefined();
    expect(s._listProjection).toBe(true);
  });

  it("4k synthetic fat jobs compress dramatically when slimmed (pre-deploy gate)", () => {
    // Real benefit: fails the build if list projection ever re-grows fat.
    // Mirrors production scale (~4181 jobs) with heavy line arrays + full status maps.
    const fatJob = (i) => ({
      id: "qbo-" + (16000 + i),
      customer: "Customer Name LLC " + i,
      address: "123 Main Street Brooklyn NY 11213",
      serviceAddress: "123 Main Street Brooklyn NY 11213",
      billingAddress: "123 Main Street Brooklyn NY 11213",
      amount: "$25000",
      openBalance: "$5000",
      invoiceNo: String(251800 + i),
      status: {
        Lead: { s: "done", d: "2024-01-01", note: "extra" },
        "Site Visit": { s: "skipped" },
        Estimate: { s: "done", d: "2024-01-02" },
        Accepted: { s: "done" },
        Invoiced: { s: "done", d: "2024-01-03" },
        "Deposit Receipt": { s: "skipped" },
        Paperwork: { s: "skipped" },
        Scheduled: { s: "skipped" },
        Done: { s: "" },
        "Follow-up": { s: "" },
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
    // Must crush fat payloads; stay under ~0.8KB/job average for this shape
    expect(slimBytes).toBeLessThan(fatBytes * 0.15);
    expect(slimBytes / N).toBeLessThan(800);
    // Absolute ceiling: list payload for 4k must stay under 3.2 MB in this harness
    // (live was ~4.3 MB before v316 status/payments trim)
    expect(slimBytes).toBeLessThan(3_200_000);
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
