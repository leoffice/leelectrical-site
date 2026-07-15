// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  dismissInvoicePair,
  findDuplicateInvoiceSuggestion,
  invoiceCompareRows,
  invoicePairId,
  isExactInvoiceDuplicate,
  isInvoiceDismissed,
  pickKeeperJob,
  planExactInvoiceAutoDedup,
  qboStubJobIds,
  shouldPromptInvoiceDedup,
} from "../src/lib/invoiceDedup.js";

const job = (id, invoiceNo, extra = {}) => ({
  id,
  customer: "Test Customer",
  invoiceNo,
  title: "Job " + id,
  amount: "$100",
  ...extra,
});

describe("findDuplicateInvoiceSuggestion", () => {
  beforeEach(() => localStorage.clear());

  it("finds two jobs with the same invoice number", () => {
    const s = findDuplicateInvoiceSuggestion([job("J-1", "251808"), job("J-2", "251808")]);
    expect(s).toBeTruthy();
    expect(s.invoiceNo).toBe("251808");
    expect(s.a.job.id).toBe("J-1");
    expect(s.b.job.id).toBe("J-2");
  });

  it("ignores dismissed pairs", () => {
    dismissInvoicePair("251808", "J-1", "J-2");
    expect(findDuplicateInvoiceSuggestion([job("J-1", "251808"), job("J-2", "251808")])).toBeNull();
    expect(isInvoiceDismissed("251808", "J-1", "J-2")).toBe(true);
  });

  it("invoicePairId is order-independent", () => {
    expect(invoicePairId("99", "b", "a")).toBe(invoicePairId("99", "a", "b"));
  });

  it("pickKeeperJob prefers QBO link and payments", () => {
    const a = job("J-1", "1");
    const b = job("J-2", "1", { qboCustomerId: "42", payments: [{ amount: 50 }] });
    expect(pickKeeperJob(a, b).id).toBe("J-2");
  });

  it("qboStubJobIds finds auto-imported rows for the same invoice number", () => {
    const jobs = [
      job("local-1", "251900"),
      job("qbo-251900", "251900"),
      job("qbo-251901", "251901"),
    ];
    expect(qboStubJobIds(jobs, "251900", "local-1")).toEqual(["qbo-251900"]);
    expect(qboStubJobIds(jobs, "251900", "qbo-251900")).toEqual([]);
  });

  it("invoiceCompareRows lines up customer, service, amount, date, and invoice #", () => {
    const jobs = [
      job("J-1", "251808", { customer: "Arthur", serviceAddress: "10 Oak", amount: "$100", invoiceDate: "2026-07-01" }),
      job("J-2", "251808", { customer: "Art", serviceAddress: "20 Pine", amount: "$200", invoiceDate: "2026-07-02" }),
    ];
    const rows = invoiceCompareRows(jobs[0], jobs[1], jobs);
    expect(rows.map((r) => r.label)).toEqual([
      "Customer",
      "Service",
      "Amount",
      "Invoice date",
      "Invoice #",
    ]);
    expect(rows[0].left).toBe("Arthur");
    expect(rows[3].left).toBe("2026-07-01");
    expect(rows[4].right).toBe("251808");
  });

  it("isExactInvoiceDuplicate requires matching #, date, and amount", () => {
    const base = job("J-1", "251808", { amount: "$500", invoiceDate: "2026-07-10" });
    const twin = job("J-2", "251808", { amount: "$500", invoiceDate: "2026-07-10" });
    const diffDate = job("J-3", "251808", { amount: "$500", invoiceDate: "2026-07-11" });
    expect(isExactInvoiceDuplicate(base, twin)).toBe(true);
    expect(isExactInvoiceDuplicate(base, diffDate)).toBe(false);
  });

  it("shouldPromptInvoiceDedup skips exact dupes and different-date pairs", () => {
    const a = job("J-1", "251808", { amount: "$500", invoiceDate: "2026-07-10" });
    const twin = job("J-2", "251808", { amount: "$500", invoiceDate: "2026-07-10" });
    const diffDate = job("J-3", "251808", { amount: "$500", invoiceDate: "2026-07-11" });
    expect(shouldPromptInvoiceDedup(a, twin)).toBe(false);
    expect(shouldPromptInvoiceDedup(a, diffDate)).toBe(false);
    expect(shouldPromptInvoiceDedup(a, job("J-4", "251808", { amount: "$600", invoiceDate: "2026-07-10" }))).toBe(true);
  });

  it("findDuplicateInvoiceSuggestion ignores exact duplicates and different dates", () => {
    const exact = [
      job("J-1", "251808", { amount: "$100", invoiceDate: "2026-07-01" }),
      job("J-2", "251808", { amount: "$100", invoiceDate: "2026-07-01" }),
    ];
    expect(findDuplicateInvoiceSuggestion(exact)).toBeNull();

    const diffDate = [
      job("J-1", "251808", { amount: "$100", invoiceDate: "2026-07-01" }),
      job("J-2", "251808", { amount: "$100", invoiceDate: "2026-07-02" }),
    ];
    expect(findDuplicateInvoiceSuggestion(diffDate)).toBeNull();
  });

  it("planExactInvoiceAutoDedup drops weaker rows in exact clusters", () => {
    const jobs = [
      job("J-1", "251808", { amount: "$100", invoiceDate: "2026-07-01" }),
      job("J-2", "251808", {
        amount: "$100",
        invoiceDate: "2026-07-01",
        qboCustomerId: "42",
      }),
    ];
    expect(planExactInvoiceAutoDedup(jobs)).toEqual([
      { dropId: "J-1", keepId: "J-2", invoiceNo: "251808" },
    ]);
  });
});