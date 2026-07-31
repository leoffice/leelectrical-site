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

  // ── P0 DATA-LOSS GUARDRAIL (Seewald 4th $5k) — Levi 2026-07-31 ────────────
  // Root cause: amount-only samePaymentRow + QBO-as-base merge dropped local
  // rows when QBO returned fewer identical-amount payments.

  it("Seewald case: four local $5k + three QBO $5k → all four local survive", () => {
    const job = {
      amount: "$20000",
      paymentBaseline: 20000,
      paid: true,
      openBalance: 0,
      payments: [
        { id: "seewald-1", amount: "$5000", method: "Zelle", date: "2026-05-01", source: "lepro" },
        { id: "seewald-2", amount: "$5000", method: "Zelle", date: "2026-05-15", source: "lepro" },
        { id: "seewald-3", amount: "$5000", method: "Zelle", date: "2026-06-01", source: "lepro" },
        { id: "seewald-4", amount: "$5000", method: "Zelle", date: "2026-06-15", source: "lepro" },
      ],
    };
    const qbo = [
      { id: "qbo-a", qboPaymentId: "1001", amount: "$5000", method: "Zelle", date: "2026-05-01" },
      { id: "qbo-b", qboPaymentId: "1002", amount: "$5000", method: "Zelle", date: "2026-05-15" },
      { id: "qbo-c", qboPaymentId: "1003", amount: "$5000", method: "Zelle", date: "2026-06-01" },
    ];
    const merged = mergeLocalAndQboPayments(job, qbo);
    expect(merged.length).toBe(4);
    const localIds = merged.map((p) => p.id).filter((id) => String(id).startsWith("seewald-"));
    expect(localIds).toHaveLength(4);
    expect(localIds).toEqual(expect.arrayContaining(["seewald-1", "seewald-2", "seewald-3", "seewald-4"]));
    // Exactly one local had no QBO pair — retained + flagged, never deleted.
    const flagged = merged.filter((p) => p.notInQbo || p.syncFlag === "not_in_qbo");
    expect(flagged).toHaveLength(1);
    expect(["seewald-1", "seewald-2", "seewald-3", "seewald-4"]).toContain(flagged[0].id);
    // With matching dates, the unpaired one is the local date QBO never returned.
    expect(flagged[0].id).toBe("seewald-4");
    // Total paid still $20k (no double-count, no drop).
    const total = merged.reduce((s, p) => s + Number(String(p.amount).replace(/[^0-9.-]/g, "")), 0);
    expect(total).toBe(20000);
  });

  it("Seewald via patchFromQboPaymentFetch: 4 local + 3 QBO → 4 payments in patch", () => {
    const job = {
      amount: "$20000",
      paymentBaseline: 20000,
      paid: true,
      openBalance: 0,
      payments: [
        { id: "s1", amount: "5000", method: "Zelle", date: "2026-05-01" },
        { id: "s2", amount: "5000", method: "Zelle", date: "2026-05-15" },
        { id: "s3", amount: "5000", method: "Zelle", date: "2026-06-01" },
        { id: "s4", amount: "5000", method: "Zelle", date: "2026-06-15" },
      ],
      status: { Paid: { s: "done", d: "2026-06-15" }, "Follow-up": { s: "done", d: "2026-06-15" } },
    };
    const patch = patchFromQboPaymentFetch(job, {
      invoiceNo: "999",
      invoiceTotal: 20000,
      openBalance: 5000, // QBO lagging / missing 4th
      payments: [
        { id: "qbo-1", qboPaymentId: "1", amount: 5000, method: "Zelle", date: "2026-05-01" },
        { id: "qbo-2", qboPaymentId: "2", amount: 5000, method: "Zelle", date: "2026-05-15" },
        { id: "qbo-3", qboPaymentId: "3", amount: 5000, method: "Zelle", date: "2026-06-01" },
      ],
    });
    expect(patch.payments).toHaveLength(4);
    expect(patch.payments.map((p) => p.id).sort()).toEqual(["s1", "s2", "s3", "s4"].sort());
    // Local ledger covers invoice → stay paid even if QBO open balance is non-zero.
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
  });

  it("unmatched local payment is retained and flagged not in QBO", () => {
    const job = {
      amount: "$900",
      paymentBaseline: 900,
      payments: [
        { id: "local-only", amount: "$400", method: "Check", ref: "1042", date: "2026-07-01", source: "lepro" },
        { id: "local-shared", amount: "$500", method: "Zelle", ref: "JPM99", date: "2026-07-02", source: "lepro" },
      ],
    };
    const qbo = [
      { id: "qbo-500", qboPaymentId: "55", amount: "$500", method: "Zelle", ref: "JPM99", date: "2026-07-02" },
    ];
    const merged = mergeLocalAndQboPayments(job, qbo);
    expect(merged).toHaveLength(2);
    const only = merged.find((p) => p.id === "local-only");
    expect(only).toBeTruthy();
    expect(only.notInQbo).toBe(true);
    expect(only.syncFlag).toBe("not_in_qbo");
    const shared = merged.find((p) => p.id === "local-shared");
    expect(shared.qboPaymentId).toBe("55");
    expect(shared.notInQbo).toBeFalsy();
  });

  it("empty QBO payment list never wipes local ledger", () => {
    const job = {
      amount: "$1200",
      paymentBaseline: 1200,
      paid: true,
      payments: [
        { id: "a", amount: "600", method: "Zelle", date: "2026-07-01" },
        { id: "b", amount: "600", method: "Check", ref: "99", date: "2026-07-02" },
      ],
    };
    const merged = mergeLocalAndQboPayments(job, []);
    expect(merged).toHaveLength(2);
    expect(merged.every((p) => p.notInQbo)).toBe(true);

    const patch = patchFromQboPaymentFetch(job, {
      invoiceTotal: 1200,
      openBalance: 1200,
      payments: [],
    });
    expect(patch.payments).toHaveLength(2);
    expect(patch.paid).toBe(true);
  });

  it("identical amounts without shared id are paired 1:1 (occurrence count), not all-to-all", () => {
    const job = {
      payments: [
        { id: "l1", amount: "$100", date: "2026-01-01" },
        { id: "l2", amount: "$100", date: "2026-01-02" },
        { id: "l3", amount: "$100", date: "2026-01-03" },
      ],
    };
    // Two QBO rows same amount — only two locals should pair; third flagged.
    const qbo = [
      { id: "q1", qboPaymentId: "q1", amount: "$100", date: "2026-01-01" },
      { id: "q2", qboPaymentId: "q2", amount: "$100", date: "2026-01-02" },
    ];
    const merged = mergeLocalAndQboPayments(job, qbo);
    expect(merged).toHaveLength(3);
    expect(merged.filter((p) => p.notInQbo)).toHaveLength(1);
    expect(merged.filter((p) => p.qboPaymentId)).toHaveLength(2);
  });

  it("QBO-only rows still append when no local ledger", () => {
    const merged = mergeLocalAndQboPayments({ payments: [] }, [
      { id: "qbo-9", qboPaymentId: "9", amount: "$50", method: "Check", date: "2026-07-01" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qboPaymentId).toBe("9");
  });
});