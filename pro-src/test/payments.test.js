import { describe, expect, it } from "vitest";
import {
  appendPayment,
  canVoidInQbo,
  fmtPaymentLine,
  movePayment,
  normalizePaymentMethod,
  normalizePayments,
  reconcileBalanceOnAmountChange,
  removePayment,
  remainingBalance,
  updatePayment,
} from "../src/lib/payments.js";
import { amountPaid, openBalance } from "../src/lib/customers.js";
import {
  formatInvoicePayOption,
  invoicesForCustomerPick,
} from "../src/lib/customerDocLists.js";

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

  // Levi 2026-07-22 — Inv #251843: $450 check recorded in QBO but job still unpaid.
  // Root cause: openBalance still full invoice + new payment → baseline open+paid (double count).
  it("full pay on job with openBalance set marks paid (no double baseline)", () => {
    const inv = {
      id: "qbo-251843",
      amount: "$450",
      openBalance: "$450",
      invoiceNo: "251843",
      paid: false,
    };
    const patch = appendPayment(inv, {
      amount: 450,
      method: "Check",
      ref: "1356",
      date: "2026-07-14",
    });
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
    expect(patch.paymentBaseline).toBe(450);
    expect(patch.payments).toHaveLength(1);
    expect(patch.status?.Paid?.s).toBe("done");
  });

  it("heals corrupt double-counted paymentBaseline on full-pay invoice", () => {
    const corrupted = {
      id: "qbo-251843",
      amount: "$450",
      invoiceNo: "251843",
      openBalance: 450,
      paid: false,
      paymentBaseline: 900,
      amountWhenBaselined: 450,
      payments: [{ id: "p1", amount: "450", method: "Check", date: "2026-07-14" }],
    };
    expect(openBalance(corrupted)).toBe(0);
    expect(amountPaid(corrupted)).toBe(450);
    const patch = updatePayment(corrupted, "p1", {
      amount: 450,
      method: "Check",
      date: "2026-07-14",
    });
    expect(patch.paid).toBe(true);
    expect(patch.openBalance).toBe(0);
    expect(patch.paymentBaseline).toBe(450);
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

  it("movePayment updates in place on the same job", () => {
    const patch = appendPayment(job, { amount: 1000, method: "Zelle", date: "2026-07-07", id: "pay-1" });
    // appendPayment always assigns a new id — grab it
    const merged = { ...job, ...patch };
    const payId = merged.payments[0].id;
    const moved = movePayment(merged, merged, payId, { amount: 2500, method: "Check", date: "2026-07-08" });
    expect(moved.same).toBe(true);
    expect(moved.patches).toHaveLength(1);
    expect(moved.patches[0].patch.openBalance).toBe(8500);
    expect(moved.patches[0].patch.payments[0].method).toBe("Check");
  });

  it("movePayment redirects payment to another invoice job", () => {
    const from = {
      id: "j-wrong",
      customer: "Acme",
      amount: "$5,000",
      invoiceNo: "100",
      serviceAddress: "1 Wrong St",
      paid: false,
    };
    const to = {
      id: "j-right",
      customer: "Acme",
      amount: "$5,000",
      invoiceNo: "200",
      serviceAddress: "99 Right Ave",
      paid: false,
    };
    const staged = appendPayment(from, { amount: 1500, method: "Zelle", date: "2026-07-07" });
    const fromLive = { ...from, ...staged };
    const payId = fromLive.payments[0].id;
    const moved = movePayment(fromLive, to, payId, { amount: 1500, method: "Zelle", date: "2026-07-07" });
    expect(moved.same).toBe(false);
    expect(moved.patches).toHaveLength(2);
    const fromPatch = moved.patches.find((p) => p.jobId === "j-wrong").patch;
    const toPatch = moved.patches.find((p) => p.jobId === "j-right").patch;
    expect(fromPatch.payments).toHaveLength(0);
    expect(fromPatch.openBalance).toBe(5000);
    expect(toPatch.payments).toHaveLength(1);
    expect(toPatch.payments[0].id).toBe(payId);
    expect(toPatch.openBalance).toBe(3500);
  });

  it("formatInvoicePayOption includes service address", () => {
    const label = formatInvoicePayOption({
      invoiceNo: "231595",
      serviceAddress: "1446 Lincoln Pl",
      amount: "$1,000",
      openBalance: 400,
      paid: false,
    });
    expect(label).toContain("Inv #231595");
    expect(label).toContain("1446 Lincoln Pl");
  });

  it("invoicesForCustomerPick lists invoices with open ones first", () => {
    const jobs = [
      {
        id: "a",
        customer: "Acme Co",
        businessName: "Acme Co",
        invoiceNo: "1",
        paid: true,
        openBalance: 0,
        amount: 100,
        serviceAddress: "10 A St",
      },
      {
        id: "b",
        customer: "Acme Co",
        businessName: "Acme Co",
        invoiceNo: "2",
        paid: false,
        openBalance: 50,
        amount: 50,
        serviceAddress: "20 B St",
      },
    ];
    const list = invoicesForCustomerPick(jobs, "Acme Co", { openOnly: false });
    expect(list.map((j) => j.invoiceNo)).toEqual(["2", "1"]);
  });

  // Levi 2026-07-22 — Chanan Sheleg: progress draw raised 50%→80%, invoice
  // total went up, but balance due stayed frozen at the old remaining.
  it("progress invoice total raise updates balance due (invoice − paid)", () => {
    // 50% draw was $25,000; $20,000 paid → $5,000 open. Then raised to $36,800.
    const afterRaise = {
      id: "j-progress",
      invoiceNo: "251808",
      amount: "$36,800",
      paid: false,
      paymentBaseline: 25000,
      openBalance: 5000,
      invoiceProgressBilling: true,
      invoiceProgressPct: 80,
      payments: [
        { id: "p1", amount: "$5,000", method: "Check", date: "2026-03-20" },
        { id: "p2", amount: "$5,000", method: "Zelle", date: "2026-04-10" },
        { id: "p3", amount: "$5,000", method: "Check", date: "2026-05-01" },
        { id: "p4", amount: "$5,000", method: "Zelle", date: "2026-06-15" },
      ],
    };
    expect(amountPaid(afterRaise)).toBe(20000);
    expect(openBalance(afterRaise)).toBe(16800); // 36800 − 20000, not the frozen $5,000
    expect(remainingBalance(afterRaise, afterRaise.payments)).toBe(16800);
  });

  it("reconcileBalanceOnAmountChange bumps baseline when draw amount rises", () => {
    const before = {
      id: "j1",
      invoiceNo: "1",
      amount: "$25,000",
      paid: false,
      paymentBaseline: 25000,
      amountWhenBaselined: 25000,
      openBalance: 5000,
      payments: [{ id: "p1", amount: "20000", method: "Check", date: "2026-03-01" }],
    };
    const patch = reconcileBalanceOnAmountChange(before, 36800);
    expect(patch.paymentBaseline).toBe(36800);
    expect(patch.openBalance).toBe(16800);
    expect(patch.paid).toBe(false);
    expect(patch.amountWhenBaselined).toBe(36800);
  });

  it("incomplete ledger (amount ≫ baseline, not progress) keeps open balance", () => {
    // QBO import: full invoice $41k on file, $11k still open, one LE payment $1k.
    const incomplete = {
      id: "j-qbo",
      invoiceNo: "999",
      amount: "$41,000",
      paid: false,
      paymentBaseline: 12000,
      openBalance: 11000,
      payments: [{ id: "p1", amount: "1000", method: "Cash", date: "2026-01-01" }],
    };
    expect(openBalance(incomplete)).toBe(11000);
  });

  it("progress raise without progress flags still fixes when most of baseline was paid", () => {
    // Same Chanan numbers, no invoiceProgressBilling marker on the job.
    const job = {
      id: "j-legacy",
      invoiceNo: "251808",
      amount: "$36,800",
      paid: false,
      paymentBaseline: 25000,
      openBalance: 5000,
      payments: [{ id: "p1", amount: "20000", method: "Check", date: "2026-03-01" }],
    };
    expect(openBalance(job)).toBe(16800);
  });
});