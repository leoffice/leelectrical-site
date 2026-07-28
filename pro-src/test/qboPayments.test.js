import { describe, expect, it } from "vitest";
import {
  mergeLocalAndQboPayments,
  patchFromQboPaymentFetch,
  patchFromSolaPayment,
} from "../src/lib/qboPayments.js";
import { appendPayment } from "../src/lib/payments.js";

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

  // Levi 2026-07-22 — paid must not depend on QuickBooks confirmation.
  it("keeps local full-pay as paid when QBO still shows open balance (lag)", () => {
    const job = {
      amount: "$450",
      invoiceNo: "251843",
      openBalance: 0,
      paid: true,
      paymentBaseline: 450,
      payments: [
        {
          id: "pay-local-1",
          amount: "450",
          method: "Check",
          ref: "1042",
          date: "2026-07-22",
          source: "lepro",
        },
      ],
      status: { Paid: { s: "done", d: "2026-07-22" }, "Follow-up": { s: "done", d: "2026-07-22" } },
    };
    const fetch = {
      invoiceNo: "251843",
      invoiceTotal: 450,
      openBalance: 450, // QBO still lagging
      payments: [], // not absorbed yet
    };
    const patch = patchFromQboPaymentFetch(job, fetch);
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
    expect(patch.payments).toHaveLength(1);
    expect(patch.payments[0].id).toBe("pay-local-1");
    expect(patch.status.Paid.s).toBe("done");
  });

  it("keeps local payment rows when merging partial QBO history", () => {
    const job = {
      amount: "$800",
      openBalance: 0,
      paid: true,
      paymentBaseline: 800,
      payments: [{ id: "pay-local-z", amount: "800", method: "Zelle", ref: "JPM1", date: "2026-07-22" }],
    };
    const merged = mergeLocalAndQboPayments(job, [
      { id: "qbo-1", qboPaymentId: "9", amount: "$100", method: "Check", date: "2026-06-01", ref: "1" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.some((p) => p.id === "pay-local-z")).toBe(true);
  });

  it("QBO balance $0 marks paid even if payment list incomplete", () => {
    const job = { amount: "$800", openBalance: 800, paid: false, invoiceNo: "231388" };
    const patch = patchFromQboPaymentFetch(job, {
      invoiceNo: "231388",
      invoiceTotal: 800,
      openBalance: 0,
      payments: [],
    });
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
  });

  it("appendPayment marks paid without any QBO step", () => {
    const job = { amount: "$450", openBalance: "$450", paid: false, invoiceNo: "251843" };
    const patch = appendPayment(job, {
      amount: "450",
      method: "Check",
      ref: "1042",
      date: "2026-07-22",
    });
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
    expect(patch.status.Paid.s).toBe("done");
  });
});