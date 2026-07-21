import { describe, expect, it } from "vitest";
import {
  openBalance,
  amountPaid,
  totalBalanceDue,
  customerAmountSummary,
  isInvoiceJob,
} from "../src/lib/customers.js";

// HARD RULE: balance due = sum of OPEN INVOICE balances only. Estimates are
// NEVER counted in any form (Shaina Levin / ManyCoin / 315 Albany bug).

const estimateOnly = { id: "e1", estimateNo: "2013", amount: 5200, paid: false }; // NO invoiceNo
const openInvoice = { id: "i1", invoiceNo: "1003", amount: 650, paid: false };
const partialInvoice = {
  id: "i2",
  invoiceNo: "1002",
  amount: 8500,
  paid: false,
  payments: [{ amount: 4250, method: "Check" }],
};
const paidInvoice = { id: "i3", invoiceNo: "1001", amount: 2400, paid: true };

describe("balance rule — estimates never count toward due", () => {
  it("an estimate-only job owes $0 (was previously counted as its full amount)", () => {
    expect(isInvoiceJob(estimateOnly)).toBe(false);
    expect(openBalance(estimateOnly)).toBe(0);
    // and it must not masquerade as fully paid via the total-minus-due inference
    expect(amountPaid(estimateOnly)).toBe(0);
  });

  it("an open invoice with no payments owes its full amount", () => {
    expect(openBalance(openInvoice)).toBe(650);
  });

  it("a partially paid invoice owes amount minus payments", () => {
    expect(openBalance(partialInvoice)).toBe(4250);
    expect(amountPaid(partialInvoice)).toBe(4250);
  });

  it("a paid invoice owes $0", () => {
    expect(openBalance(paidInvoice)).toBe(0);
  });

  it("customer balance = sum of open invoice balances only; estimates contribute $0", () => {
    const jobs = [estimateOnly, openInvoice, partialInvoice, paidInvoice];
    // due = 650 + 4250 (+0 estimate +0 paid) = 4900 — NOT 5200+650+4250 = 10100
    expect(totalBalanceDue(jobs)).toBe(4900);
    const s = customerAmountSummary(jobs);
    expect(s.due).toBe(4900);
    // invoiced/paid exclude the estimate entirely
    expect(s.invoiced).toBe(650 + 8500 + 2400); // 11550, estimate's 5200 excluded
    expect(s.paid).toBe(0 + 4250 + 2400); // 6650
    expect(s.openInvoices).toBe(2); // the two unpaid invoices, not the estimate
  });

  it("a customer with ONLY an estimate shows $0 due (Shaina-Levin case)", () => {
    const s = customerAmountSummary([estimateOnly]);
    expect(s.due).toBe(0);
    expect(s.invoiced).toBe(0);
    expect(totalBalanceDue([estimateOnly])).toBe(0);
  });
});
