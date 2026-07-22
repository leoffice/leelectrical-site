/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  assignLinkStyles,
  buildCustomerTransactions,
  formatTxnAmount,
  linkColorForDoc,
  linkColorKeyForJob,
  shortTxnDate,
  txnFilterCounts,
  txnKindStyle,
  txnRowDisplay,
} from "../src/lib/customerTransactions.js";

describe("customerTransactions", () => {
  const jobs = [
    {
      id: "j1",
      customer: "Acme Co",
      invoiceNo: "1001",
      estimateNo: "E-1001",
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

  it("linkColorForDoc is stable per invoice number and includes shape", () => {
    expect(linkColorForDoc("1001")).toEqual(linkColorForDoc("1001"));
    expect(linkColorForDoc("1001").bg).toBeTruthy();
    expect(linkColorForDoc("1001").shape).toMatch(/pill|square|tag/);
    // No green on doc bubbles — green is reserved for payment amounts
    expect(linkColorForDoc("1001").bg).not.toMatch(/emerald/);
    expect(linkColorForDoc("9999").text).toMatch(/^text-/);
  });

  it("assignLinkStyles prefers unique color+shape pairs across a list", () => {
    const keys = Array.from({ length: 14 }, (_, i) => String(2000 + i));
    const map = assignLinkStyles(keys);
    const tokens = keys.map((k) => {
      const s = map.get(k);
      return s.bg + ":" + s.shape;
    });
    // First 12 should all be unique (palette size × at least one shape)
    expect(new Set(tokens.slice(0, 12)).size).toBe(12);
  });

  it("txnKindStyle gives distinct colors for payment, invoice, estimate", () => {
    expect(txnKindStyle("payment").label).toBe("Payment");
    expect(txnKindStyle("invoice").label).toBe("Invoice");
    expect(txnKindStyle("estimate").label).toBe("Estimate");
    expect(txnKindStyle("payment").className).toMatch(/emerald/);
    // Invoice label is neutral so the colored doc bubble carries identity
    expect(txnKindStyle("invoice").className).toMatch(/slate/);
    expect(txnKindStyle("estimate").className).toMatch(/amber/);
    expect(txnKindStyle("payment").className).not.toBe(txnKindStyle("invoice").className);
    expect(txnKindStyle("invoice").className).not.toBe(txnKindStyle("estimate").className);
  });

  it("linkColorKeyForJob prefers invoice / linked invoice over estimate", () => {
    expect(linkColorKeyForJob({ invoiceNo: "1001", estimateNo: "E-9" })).toBe("1001");
    expect(linkColorKeyForJob({ linkedInvoiceNo: "1001", estimateNo: "E-9" })).toBe("1001");
    expect(linkColorKeyForJob({ estimateNo: "E-9" })).toBe("E-9");
  });

  it("linked estimate+invoice on same job share bubble color", () => {
    const rows = buildCustomerTransactions(jobs, { filter: "all" });
    const inv = rows.find((r) => r.kind === "invoice" && r.docNo === "1001");
    const est = rows.find((r) => r.kind === "estimate" && r.docNo === "E-1001");
    const pay = rows.find((r) => r.kind === "payment" && r.docNo === "1001");
    expect(inv.color).toEqual(est.color);
    expect(inv.color).toEqual(pay.color);
  });

  it("estimate linked via linkedInvoiceNo matches that invoice color", () => {
    const linked = [
      {
        id: "inv",
        customer: "Acme",
        invoiceNo: "5000",
        invoiceDate: "2026-07-01",
        amount: "800",
        serviceAddress: "1 A St",
      },
      {
        id: "est",
        customer: "Acme",
        estimateNo: "E-5000",
        estimateDate: "2026-06-20",
        linkedInvoiceNo: "5000",
        amount: "800",
        serviceAddress: "1 A St",
      },
    ];
    const rows = buildCustomerTransactions(linked, { filter: "all" });
    const inv = rows.find((r) => r.kind === "invoice");
    const est = rows.find((r) => r.kind === "estimate");
    expect(inv.color).toEqual(est.color);
    expect(est.color).toEqual(linkColorForDoc("5000"));
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
    expect(c.estimates).toBe(2); // standalone E-9 + E-1001 on j1
    expect(c.all).toBe(6);
  });

  it("invoice shows due when different from total", () => {
    const inv = buildCustomerTransactions(jobs, { filter: "invoices" }).find((r) => r.docNo === "1001");
    expect(inv.total).toBe(1000);
    expect(inv.due).toBe(400);
    expect(inv.address).toContain("Main");
  });

  it("txnRowDisplay: invoices show due only (incl. $0); open invoices flagged", () => {
    const open = buildCustomerTransactions(jobs, { filter: "invoices" }).find((r) => r.docNo === "1001");
    const paid = buildCustomerTransactions(jobs, { filter: "invoices" }).find((r) => r.docNo === "1002");
    const est = buildCustomerTransactions(jobs, { filter: "estimates" }).find((r) => r.docNo === "E-9");
    const pay = buildCustomerTransactions(jobs, { filter: "payments" })[0];

    const openDisp = txnRowDisplay(open);
    expect(openDisp.amount).toBe(formatTxnAmount(400));
    expect(openDisp.isOpen).toBe(true);
    expect(openDisp.amountClass).toMatch(/red/);

    const paidDisp = txnRowDisplay(paid);
    expect(paidDisp.amount).toBe("$0");
    expect(paidDisp.isOpen).toBe(false);

    const estDisp = txnRowDisplay(est);
    expect(estDisp.amount).toBe(formatTxnAmount(200));
    expect(estDisp.isOpen).toBe(false);

    const payDisp = txnRowDisplay(pay);
    expect(payDisp.amount).toBeTruthy();
    expect(payDisp.isOpen).toBe(false);
    expect(payDisp.amountClass).toMatch(/emerald/);
  });
});
