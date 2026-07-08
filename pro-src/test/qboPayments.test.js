import { describe, expect, it } from "vitest";
import { patchFromQboPaymentFetch, patchFromSolaPayment } from "../src/lib/qboPayments.js";

describe("qboPayments", () => {
  it("applies partial Sola payment without marking paid in full", () => {
    const job = { amount: "$25,000", openBalance: "$9,999", notes: "Open balance $9,999 of $25,000" };
    const patch = patchFromSolaPayment(job, { amount: 1, ref: "10964146594", method: "Visa", date: "2026-07-08" });
    expect(patch.paid).toBe(false);
    expect(patch.openBalance).toBe(9998);
    expect(patch.payments).toHaveLength(1);
    expect(patch.payments[0].amount).toBe("$1");
  });

  it("builds overlay from fetch_payments JSON", () => {
    const job = { amount: "$25,000", invoiceNo: "251808" };
    const fetch = {
      invoiceNo: "251808",
      invoiceTotal: 25000,
      openBalance: 9999,
      payments: [
        { id: "qbo-19960", amount: 1, method: "QBO", ref: "19960", date: "2026-07-08" },
        { id: "qbo-19938", amount: 5000, method: "QBO", ref: "x", date: "2026-06-29" },
      ],
    };
    const patch = patchFromQboPaymentFetch(job, fetch);
    expect(patch.payments).toHaveLength(2);
    expect(patch.openBalance).toBe(9999);
    expect(patch.paid).toBe(false);
  });
});