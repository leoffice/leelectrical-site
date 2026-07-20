/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  buildCustomerTransactions,
  customerTransactionSummary,
  linkColorForDoc,
  resolvePaymentInvoice,
  shortTxnDate,
  txnFilterCounts,
} from "../src/lib/customerTransactions.js";

describe("customerTransactions", () => {
  const jobs = [
    {
      id: "j1",
      customer: "Acme Co",
      invoiceNo: "1001",
      invoiceDate: "2026-07-01",
      amount: "1000",
      openBalance: 400,
      serviceAddress: "10 Main St",
      payments: [{ id: "p1", amount: "600", date: "2026-07-05", method: "Zelle" }],
    },
    {
      id: "j2",
      customer: "Acme Co",
      invoiceNo: "1002",
      invoiceDate: "2026-06-15",
      amount: "500",
      paid: true,
      openBalance: 0,
      serviceAddress: "20 Oak Ave",
      payments: [{ id: "p2", amount: "500", date: "2026-06-20", method: "Check" }],
    },
    {
      id: "j3",
      customer: "Acme Co",
      estimateNo: "E-9",
      estimateDate: "2026-07-10",
      amount: "200",
      serviceAddress: "10 Main St",
    },
  ];

  it("linkColorForDoc is stable per invoice number", () => {
    expect(linkColorForDoc("1001")).toEqual(linkColorForDoc("1001"));
    expect(linkColorForDoc("1001").bg).toBeTruthy();
    // Different numbers may share a color from the palette — just ensure object shape.
    expect(linkColorForDoc("9999").text).toMatch(/^text-/);
  });

  it("shortTxnDate formats ISO dates", () => {
    expect(shortTxnDate("2026-07-05")).toMatch(/Jul|07/);
  });

  it("builds invoices, payments, and estimates across addresses", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "all", sort: "new" });
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("invoice");
    expect(kinds).toContain("payment");
    expect(kinds).toContain("estimate");
    expect(rows.some((r) => r.docNo === "1001" && r.kind === "invoice")).toBe(true);
    expect(rows.some((r) => r.kind === "payment" && r.docNo === "1001")).toBe(true);
    // Payment linked to invoice shares bubble color with that invoice
    const inv = rows.find((r) => r.kind === "invoice" && r.docNo === "1001");
    const pay = rows.find((r) => r.kind === "payment" && r.docNo === "1001");
    expect(inv.color).toEqual(pay.color);
  });

  it("filters to payments only", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "payments" });
    expect(rows.every((r) => r.kind === "payment")).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("sorts oldest first", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "invoices", sort: "old" });
    expect(rows.map((r) => r.docNo)).toEqual(["1002", "1001"]);
  });

  it("sorts newest first", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "invoices", sort: "new" });
    expect(rows.map((r) => r.docNo)).toEqual(["1001", "1002"]);
  });

  it("txnFilterCounts tallies kinds", () => {
    const c = txnFilterCounts(jobs);
    expect(c.invoices).toBe(2);
    expect(c.payments).toBe(2);
    expect(c.estimates).toBe(1);
    expect(c.all).toBe(5);
  });

  it("invoice shows due when different from total", () => {
    const inv = buildCustomerTransactions(jobs, { filter: "invoices" }).find((r) => r.docNo === "1001");
    expect(inv.total).toBe(1000);
    expect(inv.due).toBe(400);
    expect(inv.address).toContain("Main");
  });
});

describe("customerTransactions — payment→invoice relation", () => {
  const jobsById = new Map();
  const jobs = [
    {
      id: "j1",
      invoiceNo: "1001",
      invoiceDate: "2026-07-01",
      amount: "1000",
      openBalance: 400,
      payments: [{ id: "p1", amount: "600", date: "2026-07-05", method: "Zelle" }],
    },
    {
      id: "j2",
      invoiceNo: "1002",
      invoiceDate: "2026-06-15",
      amount: "500",
      paid: true,
      openBalance: 0,
      payments: [{ id: "p2", amount: "500", date: "2026-06-20", method: "Check" }],
    },
    { id: "j3", estimateNo: "E-9", estimateDate: "2026-07-10", amount: "200" },
  ];

  it("resolves a payment to its invoice via the containing job (pre-migration data)", () => {
    const job = { id: "j1", invoiceNo: "251808" };
    const link = resolvePaymentInvoice({ id: "qbo-19960", amount: "$1" }, job, jobsById);
    expect(link).toEqual({ invoiceNo: "251808", jobId: "j1", unlinked: false });
  });

  it("prefers the explicit back-reference over the containing job", () => {
    const target = { id: "j2", invoiceNo: "16664" };
    const byId = new Map([["j2", target]]);
    const link = resolvePaymentInvoice(
      { id: "qbopay-14811", jobId: "j2", invoiceNo: "16664" },
      { id: "j1", invoiceNo: "251808" },
      byId
    );
    expect(link.invoiceNo).toBe("16664");
    expect(link.jobId).toBe("j2");
  });

  it("marks a payment unlinked rather than guessing an invoice", () => {
    const link = resolvePaymentInvoice({ id: "p9", amount: "$5" }, { id: "j3" }, jobsById);
    expect(link.unlinked).toBe(true);
    expect(link.invoiceNo).toBe("");
  });

  it("payment rows carry the invoice they are applied to and tap to that job", () => {
    const rows = buildCustomerTransactions(
      [
        {
          id: "j1",
          invoiceNo: "251808",
          amount: "25000",
          openBalance: 4999,
          payments: [{ id: "qbopay-19968", amount: "5000", date: "2026-07-10", method: "Zelle", ref: "JPM99" }],
        },
      ],
      { filter: "payments" }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].docNo).toBe("251808");
    expect(rows[0].unlinked).toBe(false);
    expect(rows[0].jobId).toBe("j1");
    expect(rows[0].ref).toBe("JPM99");
  });

  it("summary invoiced/paid/due matches the rows", () => {
    const s = customerTransactionSummary(jobs);
    // j1 $1000 (paid 600, due 400) + j2 $500 (paid 500, due 0); estimate excluded
    expect(s.invoiced).toBe(1500);
    expect(s.paid).toBe(1100);
    expect(s.due).toBe(400);
  });

  it("open-balance filter returns only invoices still owing", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "open" });
    expect(rows.map((r) => r.docNo)).toEqual(["1001"]);
    expect(txnFilterCounts(jobs).open).toBe(1);
  });

  it("counts unlinked payments for the review banner", () => {
    const c = txnFilterCounts([{ id: "x", payments: [{ id: "p1", amount: "$5" }] }]);
    expect(c.unlinked).toBe(1);
  });
});
