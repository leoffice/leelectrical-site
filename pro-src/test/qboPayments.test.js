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
    expect(patch.payments[0].method).toBe("Credit card");
    expect(patch.payments[0].ref).toBe("10964146594");
  });

  it("builds overlay from fetch_payments JSON with readable methods", () => {
    const job = { amount: "$25,000", invoiceNo: "251808" };
    const fetch = {
      invoiceNo: "251808",
      invoiceTotal: 25000,
      openBalance: 9999,
      payments: [
        {
          id: "qbo-19960",
          qboPaymentId: "19960",
          syncToken: "0",
          amount: 1,
          method: "Credit card",
          ref: "10964146594",
          date: "2026-07-08",
          note: "Credit card — ref 10964146594 — 2026-07-08",
        },
        {
          id: "qbo-19938",
          qboPaymentId: "19938",
          syncToken: "1",
          amount: 5000,
          method: "Zelle",
          ref: "JPM99cnf72cg",
          date: "2026-06-29",
        },
      ],
    };
    const patch = patchFromQboPaymentFetch(job, fetch);
    expect(patch.payments).toHaveLength(2);
    expect(patch.payments[0].method).toBe("Credit card");
    expect(patch.payments[1].method).toBe("Zelle");
    expect(patch.payments[0].qboPaymentId).toBe("19960");
    expect(patch.openBalance).toBe(9999);
    expect(patch.paid).toBe(false);
  });

  it("namespaces QBO payment ids away from job ids and stamps the invoice back-ref", () => {
    const job = { id: "qbo-16664", amount: "$52,535", invoiceNo: "16664" };
    const fetch = {
      invoiceNo: "16664",
      invoiceTotal: 52535,
      openBalance: 50075,
      // Incoming id uses the colliding legacy "qbo-" shape.
      payments: [{ id: "qbo-14811", qboPaymentId: "14811", amount: 2460, date: "2020-06-04" }],
    };
    const patch = patchFromQboPaymentFetch(job, fetch);
    const p = patch.payments[0];
    expect(p.id).toBe("qbopay-14811");
    expect(p.id.startsWith("qbo-")).toBe(false);
    expect(p.qboPaymentId).toBe("14811");
    expect(p.invoiceNo).toBe("16664");
    expect(p.jobId).toBe("qbo-16664");
  });
});