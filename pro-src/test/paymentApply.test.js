// Unlinked payments + invoice suggestions for Apply-to-invoice.
import { describe, expect, it } from "vitest";
import {
  isPaymentUnlinked,
  paymentInvoiceDocNo,
  suggestInvoiceForPayment,
} from "../src/lib/paymentApply.js";
import { buildCustomerTransactions } from "../src/lib/customerTransactions.js";

describe("paymentApply", () => {
  const jobs = [
    {
      id: "j-orphan",
      customer: "Mendy Lein",
      serviceAddress: "157 Remsen Ave",
      payments: [{ id: "p1", amount: "2200", method: "Zelle", date: "2026-07-20" }],
    },
    {
      id: "j-inv",
      customer: "Mendy Lein",
      invoiceNo: "251900",
      serviceAddress: "157 Remsen Ave",
      amount: "$5500",
      openBalance: 5500,
      paid: false,
    },
    {
      id: "j-other",
      customer: "Mendy Lein",
      invoiceNo: "251800",
      serviceAddress: "10 Other St",
      amount: "$100",
      openBalance: 100,
      paid: false,
    },
  ];

  it("marks payment without invoice as unlinked", () => {
    expect(isPaymentUnlinked(jobs[0], jobs[0].payments[0])).toBe(true);
    expect(isPaymentUnlinked(jobs[1], { id: "x", amount: 1 })).toBe(false);
  });

  it("paymentInvoiceDocNo prefers job invoice then linked", () => {
    expect(paymentInvoiceDocNo(jobs[1])).toBe("251900");
    expect(paymentInvoiceDocNo({ linkedInvoiceNo: "99" })).toBe("99");
    expect(paymentInvoiceDocNo(jobs[0])).toBe("");
  });

  it("suggests same-address open invoice for unlinked payment", () => {
    const s = suggestInvoiceForPayment(jobs, jobs[0], jobs[0].payments[0]);
    expect(s).toBeTruthy();
    expect(s.kind).toBe("invoice");
    expect(s.docNo).toBe("251900");
    expect(s.label).toMatch(/251900/);
  });

  it("buildCustomerTransactions flags unlinked + attach suggestion", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "payments" });
    const pay = rows.find((r) => r.payment?.id === "p1");
    expect(pay).toBeTruthy();
    expect(pay.unlinked).toBe(true);
    expect(pay.applySuggestion?.docNo).toBe("251900");
    const linked = rows.find((r) => r.jobId === "j-inv");
    // No payments on j-inv in this set
    expect(linked).toBeFalsy();
  });

  it("linked payment is not unlinked and keeps doc bubble #", () => {
    const withPay = [
      {
        ...jobs[1],
        payments: [{ id: "p2", amount: "100", method: "Check", date: "2026-07-21" }],
      },
    ];
    const rows = buildCustomerTransactions(withPay, { filter: "payments" });
    expect(rows[0].unlinked).toBe(false);
    expect(rows[0].docNo).toBe("251900");
  });
});
