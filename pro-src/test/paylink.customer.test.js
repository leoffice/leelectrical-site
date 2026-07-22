// Unit — Feature 1/2 lib helpers: open balance, total balance due, customer
// job resolution, and the payment_link result URL parser.
import { describe, expect, it } from "vitest";
import {
  amountPaid,
  customerAmountSummary,
  customerContact,
  invoiceTotal,
  jobsForCustomerKey,
  openBalance,
  paidPct,
  totalBalanceDue,
} from "../src/lib/customers.js";
import { paylinkUrl } from "../src/components/JobSheets.jsx";

// NOTE: balance-due now comes ONLY from open invoices (Levi 2026-07-20). These
// fixtures carry an invoiceNo because they represent invoices with a balance;
// a job WITHOUT an invoice # owes $0 (see the dedicated assertion below and
// balanceEstimateRule.test.js).
describe("openBalance", () => {
  it("uses explicit openBalance when set", () => {
    expect(openBalance({ invoiceNo: "1", openBalance: "$1,250", amount: "$5,000", paid: true })).toBe(1250);
    expect(openBalance({ invoiceNo: "1", openBalance: 300 })).toBe(300);
  });
  it("falls back to unpaid amount, zero when paid", () => {
    expect(openBalance({ invoiceNo: "1", amount: "$800", paid: false })).toBe(800);
    expect(openBalance({ invoiceNo: "1", amount: "$800", paid: true })).toBe(0);
  });
  it("owes $0 without an invoice # (estimates/leads never count)", () => {
    expect(openBalance({ amount: "$800", paid: false })).toBe(0);
    expect(openBalance({ estimateNo: "2013", amount: "$5,000", paid: false })).toBe(0);
  });
  it("reads a balance figure out of notes / follow-up text", () => {
    expect(openBalance({ invoiceNo: "1", amount: "$900", paid: true, notes: "Open balance $250 remaining" })).toBe(250);
    expect(openBalance({ invoiceNo: "1", amount: "$900", paid: false, followUp: { text: "still owes 400" } })).toBe(400);
    expect(openBalance({ invoiceNo: "1", amount: "$900", paid: true, notes: "balance due: $1,050.50" })).toBe(1050.5);
  });
  it("is 0 for null / empty", () => {
    expect(openBalance(null)).toBe(0);
    expect(openBalance({})).toBe(0);
  });
  it("trusts openBalance 0 over an incomplete payment ledger (QBO paid mark)", () => {
    // Safarnovich-style: paid_patch zeros balance but payments[] still miss last $800
    const job = {
      invoiceNo: "231388",
      amount: "$7,200",
      openBalance: 0,
      paid: true,
      paymentBaseline: 7200,
      payments: [
        { id: "qbo-18437", amount: "$1000", date: "2024-01-10" },
        { id: "qbo-18301", amount: "$4400", date: "2023-10-25" },
        { id: "qbo-18300", amount: "$1000", date: "2023-10-23" },
      ],
    };
    expect(openBalance(job)).toBe(0);
    expect(amountPaid(job)).toBe(7200);
  });
  it("prefers lower of payment-remainder vs explicit openBalance", () => {
    const job = {
      invoiceNo: "1",
      amount: "$1,000",
      openBalance: 200,
      paymentBaseline: 1000,
      payments: [{ id: "p1", amount: "$500", date: "2026-01-01" }],
    };
    // payments imply $500 left; QBO openBalance says $200 — show $200
    expect(openBalance(job)).toBe(200);
  });
});

describe("amountPaid / invoiceTotal", () => {
  it("unpaid full balance -> 0 paid; partial notes -> remainder paid", () => {
    expect(amountPaid({ invoiceNo: "1", amount: "$2,300", paid: false })).toBe(0);
    expect(amountPaid({ invoiceNo: "1", amount: "$900", paid: false, notes: "still owes 400" })).toBe(500);
    expect(paidPct({ invoiceNo: "1", amount: "$900", paid: false, notes: "still owes 400" })).toBe(56);
  });
  it("paid job counts full invoice", () => {
    expect(amountPaid({ invoiceNo: "1", amount: "$800", paid: true })).toBe(800);
    expect(invoiceTotal({ amount: "$1,200" })).toBe(1200);
  });
});

describe("customerAmountSummary", () => {
  it("aggregates due, invoiced, paid across jobs", () => {
    const s = customerAmountSummary([
      { invoiceNo: "1", amount: "$1,000", paid: false },
      { invoiceNo: "2", amount: "$500", paid: true },
    ]);
    expect(s.due).toBe(1000);
    expect(s.invoiced).toBe(1500);
    expect(s.paid).toBe(500);
    expect(s.openInvoices).toBe(1);
  });
});

describe("totalBalanceDue", () => {
  it("sums open balances across a customer's jobs", () => {
    const jobs = [
      { invoiceNo: "1", amount: "$1,000", paid: false }, // 1000
      { invoiceNo: "2", amount: "$500", paid: true }, // 0
      { invoiceNo: "3", amount: "$2,000", paid: true, notes: "balance $750 left" }, // 750
    ];
    expect(totalBalanceDue(jobs)).toBe(1750);
  });
  it("empty -> 0", () => expect(totalBalanceDue([])).toBe(0));
});

describe("jobsForCustomerKey", () => {
  const jobs = [
    { id: "1", customer: "Meir Kabakov", clientGroup: "g1" },
    { id: "2", customer: "meir kabakov ", clientGroup: "g1" },
    { id: "3", customer: "Meir Kabakov." }, // no group, same name -> folds in
    { id: "4", customer: "Other Person" },
    { id: "5", customer: "Archived", _archived: true },
  ];
  it("g: key gathers grouped jobs + same-name loose jobs", () => {
    const got = jobsForCustomerKey(jobs, "g:g1").map((j) => j.id).sort();
    expect(got).toEqual(["1", "2", "3"]);
  });
  it("c: key with a folded-in name resolves to the group", () => {
    const got = jobsForCustomerKey(jobs, "c:meir kabakov").map((j) => j.id).sort();
    expect(got).toEqual(["1", "2", "3"]);
  });
  it("c: key for a standalone customer", () => {
    expect(jobsForCustomerKey(jobs, "c:other person").map((j) => j.id)).toEqual(["4"]);
  });
  it("skips archived / deleted", () => {
    expect(jobsForCustomerKey(jobs, "c:archived")).toEqual([]);
  });
  it("empty key -> []", () => expect(jobsForCustomerKey(jobs, "")).toEqual([]));
});

describe("customerContact", () => {
  it("picks the first non-empty field across jobs", () => {
    const c = customerContact([
      { customer: "Ann", phone: "", email: "" },
      { customer: "Ann", phone: "555-1", email: "a@x.com", address: "1 St" },
    ]);
    expect(c).toEqual({
      name: "Ann",
      businessName: "",
      personName: "",
      phone: "555-1",
      email: "a@x.com",
      billingAddress: "",
      apartment: "",
      address: "1 St",
      qboCustomerId: "",
    });
  });
});

describe("paylinkUrl", () => {
  it("parses {url} from a JSON string result (how the listener stores it)", () => {
    expect(paylinkUrl(JSON.stringify({ url: "https://pay.example/abc" }))).toBe("https://pay.example/abc");
  });
  it("accepts an object result", () => {
    expect(paylinkUrl({ url: "https://pay.example/xyz" })).toBe("https://pay.example/xyz");
  });
  it("accepts a bare URL string", () => {
    expect(paylinkUrl("https://pay.example/raw")).toBe("https://pay.example/raw");
  });
  it("returns '' for junk / empty", () => {
    expect(paylinkUrl("not created")).toBe("");
    expect(paylinkUrl("")).toBe("");
    expect(paylinkUrl(null)).toBe("");
  });
});
