import { describe, it, expect } from "vitest";
import { buildCompanyMetrics } from "../src/lib/companyMetrics.js";

describe("companyMetrics", () => {
  it("computes week totals from job stage dates and payments", () => {
    const jobs = [
      {
        id: "j1",
        customer: "Test Co",
        estimateNo: "100",
        invoiceNo: "200",
        amount: "$1,000",
        paid: true,
        status: {
          Estimate: { s: "done", d: "2026-07-09" },
          Invoiced: { s: "done", d: "2026-07-09" },
          Paid: { s: "done", d: "2026-07-09" },
        },
        payments: [{ amount: "$1,000", date: "2026-07-09", method: "ACH" }],
      },
    ];
    const now = new Date("2026-07-10T12:00:00");
    const m = buildCompanyMetrics(jobs, [], now);
    expect(m.week.collected.total).toBe(1000);
    expect(m.sources.jobs).toBe(1);
  });
});