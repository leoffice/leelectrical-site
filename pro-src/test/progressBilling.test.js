import { describe, expect, it } from "vitest";
import {
  applyDueAmountToLines,
  inferProgressInvoiceLines,
  isProgressBillingContext,
  progressBillLines,
  progressPctFromLines,
  roundQty,
} from "../src/lib/progressBilling.js";

describe("progressBilling", () => {
  const estimateLines = [
    { itemName: "General Wiring", qty: 1, unitPrice: 46000, description: "Full project scope" },
  ];

  it("progressBillLines uses fractional qty like QuickBooks", () => {
    const lines = progressBillLines(estimateLines, 54.34783);
    expect(lines[0].unitPrice).toBe(46000);
    expect(lines[0].qty).toBeCloseTo(0.5434783, 5);
    expect(Math.round(lines[0].qty * lines[0].unitPrice)).toBe(25000);
  });

  it("applyDueAmountToLines sets qty from dollar due", () => {
    const lines = applyDueAmountToLines(
      [{ itemName: "General Wiring", qty: 1, unitPrice: 46000, description: "Scope" }],
      estimateLines,
      25000,
      46000
    );
    expect(lines[0].unitPrice).toBe(46000);
    expect(roundQty(lines[0].qty)).toBe(roundQty(25000 / 46000));
  });

  it("inferProgressInvoiceLines for QBO-imported partial invoice", () => {
    const job = {
      id: "qbo-251808",
      invoiceNo: "251808",
      amount: "$25,000",
      contractAmount: "$46,000",
      title: "Installation of wiring",
      status: { Estimate: { s: "done" }, Accepted: { s: "done" } },
    };
    const lines = inferProgressInvoiceLines(job);
    expect(lines[0].unitPrice).toBe(46000);
    expect(lines[0].qty).toBeCloseTo(25000 / 46000, 5);
  });

  it("isProgressBillingContext for edit on invoiced project job", () => {
    const job = {
      invoiceNo: "251808",
      status: { Estimate: { s: "done" }, Accepted: { s: "done" } },
    };
    expect(isProgressBillingContext(job, { kind: "invoice", mode: "edit" })).toBe(true);
    expect(isProgressBillingContext(job, { kind: "estimate", mode: "edit" })).toBe(false);
  });

  it("progressPctFromLines", () => {
    const lines = progressBillLines(estimateLines, 50);
    expect(progressPctFromLines(lines, 46000)).toBe(50);
  });
});