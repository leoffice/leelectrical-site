/**
 * Parity pin: netlify/functions/lib/invoiceBalance.mjs is a VERBATIM port of
 * the client balance math (customers.js / payments.js / format.js) because the
 * prod deploy stage excludes pro-src/. If either side changes, this suite
 * fails — update BOTH copies together (same contract as ovPatch.mjs vs
 * data/merge.js).
 */
import { describe, expect, it } from "vitest";
import * as server from "../../netlify/functions/lib/invoiceBalance.mjs";
import {
  amountPaid as clientAmountPaid,
  invoiceTotal as clientInvoiceTotal,
  isBalanceExemptOffer as clientIsExempt,
  openBalance as clientOpenBalance,
} from "../src/lib/customers.js";
import { normalizePayments as clientNormalizePayments } from "../src/lib/payments.js";

/** Job matrix spanning every branch the pay-link refresh relies on. */
const JOBS = [
  { name: "simple open invoice", job: { invoiceNo: "1001", amount: "$675", openBalance: "$675" } },
  { name: "paid via openBalance 0", job: { invoiceNo: "1002", amount: "$500", openBalance: 0, paid: true } },
  {
    name: "partial ledger",
    job: {
      invoiceNo: "1003",
      amount: "$1,000",
      openBalance: 600,
      payments: [{ id: "p1", amount: "$400", method: "Zelle", date: "2026-08-01" }],
    },
  },
  {
    name: "ledger with tombstoned payment",
    job: {
      invoiceNo: "1004",
      amount: "$900",
      payments: [
        { id: "p1", amount: "$300", date: "2026-08-01" },
        { id: "p2", amount: "$300", date: "2026-08-02", _deleted: true },
      ],
    },
  },
  {
    name: "progress draw raised after pay (Goodness 251854 shape)",
    job: {
      invoiceNo: "251854",
      amount: "$9,200",
      openBalance: 2300,
      paid: false,
      invoiceProgressBilling: true,
      invoiceProgressPct: 50,
      paymentBaseline: 2300,
      amountWhenBaselined: 4600,
      invoiceLines: [
        { itemName: "Service Upgrade:1 Meter", description: "200A 3-phase (50% progress)", qty: 0.5, unitPrice: 9200, progressBilling: true },
      ],
      payments: [
        { id: "a", amount: "$1800", date: "2026-08-06" },
        { id: "b", amount: "$2800", date: "2026-08-09" },
      ],
    },
  },
  {
    name: "QBO paid, incomplete ledger",
    job: {
      invoiceNo: "1006",
      amount: "$30,000",
      openBalance: 0,
      paid: false,
      payments: [{ id: "p1", amount: "$25,000", date: "2026-07-01" }],
    },
  },
  {
    name: "provisional renew offer (exempt, unpaid)",
    job: {
      invoiceNo: "1007",
      amount: "$365",
      openBalance: 365,
      permitRenew: { provisional: true, excludeFromBalanceDue: true },
    },
  },
  {
    name: "renew offer with real payment (no longer exempt)",
    job: {
      invoiceNo: "1008",
      amount: "$365",
      openBalance: 0,
      permitRenew: { provisional: true },
      payments: [{ id: "p1", amount: "$365", date: "2026-08-10" }],
    },
  },
  { name: "estimate (no invoiceNo)", job: { estimateNo: "2001", amount: "$4,000", openBalance: "" } },
  { name: "legacy single payment field", job: { invoiceNo: "1010", amount: "$450", payment: { amount: "$450", method: "Check", ref: "88" } } },
  { name: "notes balance fallback", job: { invoiceNo: "1011", amount: "$2,000", notes: "customer still owes $750" } },
  { name: "paid flag no openBalance", job: { invoiceNo: "1012", amount: "$1,250", paid: true } },
];

describe("invoiceBalance server copy matches the client math", () => {
  for (const { name, job } of JOBS) {
    it(`parity: ${name}`, () => {
      expect(server.openBalance(job)).toBe(clientOpenBalance(job));
      expect(server.amountPaid(job)).toBe(clientAmountPaid(job));
      expect(server.invoiceTotal(job)).toBe(clientInvoiceTotal(job));
      expect(server.isBalanceExemptOffer(job)).toBe(clientIsExempt(job));
      const sp = server.normalizePayments(job).map((p) => [p.amount, p.method, p.date]);
      const cp = clientNormalizePayments(job).map((p) => [p.amount, p.method, p.date]);
      expect(sp).toEqual(cp);
    });
  }

  it("Goodness 251854: refresh math matches the office app ($2,300 due, $4,600 paid)", () => {
    const job = JOBS.find((j) => j.name.includes("Goodness")).job;
    expect(server.openBalance(job)).toBe(2300);
    expect(server.amountPaid(job)).toBe(4600);
  });
});
