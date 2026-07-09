// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  dismissInvoicePair,
  findDuplicateInvoiceSuggestion,
  invoicePairId,
  isInvoiceDismissed,
  pickKeeperJob,
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
});