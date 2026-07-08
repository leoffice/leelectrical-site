import { describe, expect, it } from "vitest";
import {
  appendPayment,
  canVoidInQbo,
  fmtPaymentLine,
  normalizePaymentMethod,
  normalizePayments,
  removePayment,
  remainingBalance,
  updatePayment,
} from "../src/lib/payments.js";
import { amountPaid, openBalance } from "../src/lib/customers.js";

describe("payments ledger", () => {
  const job = {
    id: "j1",
    amount: "$11,000",
    invoiceNo: "231315",
    notes: "Open balance $11,000.00 of $41,000.00",
    paid: false,
  };

  it("appendPayment partial keeps open balance", () => {
    const patch = appendPayment(job, { amount: 1000, method: "Zelle", date: "2026-07-07" });
    expect(patch.paid).toBe(false);
    expect(patch.openBalance).toBe(10000);
    expect(patch.payments).toHaveLength(1);
    expect(patch.paymentBaseline).toBe(11000);
  });

  it("migrates legacy single payment", () => {
    const legacy = {
      ...job,
      payment: { amount: "500", method: "Cash", date: "2026-01-01" },
      openBalance: 10500,
    };
    expect(normalizePayments(legacy)).toHaveLength(1);
    expect(openBalance(legacy)).toBe(10500);
    expect(amountPaid(legacy)).toBe(500);
  });

  it("fmtPaymentLine shows amount, method, date, ref", () => {
    const line = fmtPaymentLine({
      amount: "$1,000",
      method: "Zelle",
      date: "2026-07-08",
      ref: "JPM99cnf72cg",
    });
    expect(line).toBe("$1,000 · Zelle · Jul/08/26 · #JPM99cnf72cg");
  });

  it("normalizePaymentMethod maps QBO and card types", () => {
    expect(normalizePaymentMethod("QBO", { ref: "JPM99cnf72cg" })).toBe("Zelle");
    expect(normalizePaymentMethod("Visa")).toBe("Credit card");
    expect(normalizePaymentMethod("", { note: "Credit card — ref 1 — 2026-07-08" })).toBe("Credit card");
  });

  it("canVoidInQbo requires qbo metadata", () => {
    expect(canVoidInQbo({ source: "qbo", qboPaymentId: "1", syncToken: "0" })).toBe(true);
    expect(canVoidInQbo({ source: "sola", ref: "x" })).toBe(false);
  });

  it("edit and remove payments recalc balance", () => {
    let patch = appendPayment(job, { amount: 1000, method: "Zelle", date: "2026-07-07" });
    const merged = { ...job, ...patch };
    patch = updatePayment(merged, patch.payments[0].id, { amount: 2000, method: "Zelle", date: "2026-07-07" });
    expect(patch.openBalance).toBe(9000);
    const merged2 = { ...merged, ...patch };
    patch = removePayment(merged2, patch.payments[0].id);
    expect(patch.openBalance).toBe(11000);
    expect(patch.payments).toHaveLength(0);
  });
});