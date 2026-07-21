import { describe, expect, it } from "vitest";
import {
  agingStripeColor,
  groupJobsByServiceAddress,
  invoiceAgeDays,
  oldestOpenInvoiceAgeDays,
  openBalance,
} from "../src/lib/customers.js";

describe("aging stripe colors", () => {
  it("is neutral when due is 0", () => {
    expect(agingStripeColor(200, 0)).toBe("#cbd5e1");
  });
  it("gets darker red as age increases", () => {
    const under30 = agingStripeColor(10, 100);
    const d30 = agingStripeColor(30, 100);
    const d60 = agingStripeColor(60, 100);
    const d90 = agingStripeColor(90, 100);
    const d120 = agingStripeColor(120, 100);
    expect(under30).toBe("#fca5a5");
    expect(d30).toBe("#f87171");
    expect(d60).toBe("#dc2626");
    expect(d90).toBe("#991b1b");
    expect(d120).toBe("#7f1d1d");
  });
});

describe("invoice age + oldest open", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  it("reads invoiceDate for age", () => {
    expect(invoiceAgeDays({ invoiceDate: "2026-06-21" }, now)).toBe(30);
  });
  it("oldest open ignores estimates and paid invoices", () => {
    const jobs = [
      { invoiceNo: "1", amount: 500, paid: false, invoiceDate: "2026-04-01" }, // ~111d
      { estimateNo: "9", amount: 9000, paid: false, invoiceDate: "2020-01-01" }, // estimate
      { invoiceNo: "2", amount: 100, paid: true, invoiceDate: "2020-01-01" }, // paid
      { invoiceNo: "3", amount: 50, paid: false, invoiceDate: "2026-07-01" }, // ~20d
    ];
    expect(openBalance(jobs[0])).toBe(500);
    expect(openBalance(jobs[1])).toBe(0);
    const age = oldestOpenInvoiceAgeDays(jobs, now);
    expect(age).toBeGreaterThanOrEqual(100);
  });
});

describe("groupJobsByServiceAddress", () => {
  it("buckets by service address", () => {
    const groups = groupJobsByServiceAddress([
      { id: "a", serviceAddress: "10 Main", invoiceNo: "1" },
      { id: "b", serviceAddress: "10 Main", invoiceNo: "2" },
      { id: "c", address: "20 Oak", invoiceNo: "3" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.address === "10 Main").jobs).toHaveLength(2);
  });
});
