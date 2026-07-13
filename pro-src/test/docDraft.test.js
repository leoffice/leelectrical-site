import { describe, expect, it } from "vitest";
import {
  hasEstimateDraft,
  hasEstimateOnJob,
  hasInvoiceDraft,
  hasInvoiceOnJob,
} from "../src/lib/docDraft.js";

describe("docDraft", () => {
  it("detects local estimate draft without QuickBooks number", () => {
    const job = {
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 500 }],
    };
    expect(hasEstimateDraft(job)).toBe(true);
    expect(hasEstimateOnJob(job)).toBe(true);
  });

  it("ignores synced estimates", () => {
    const job = {
      estimateNo: "E-1",
      _estimateConfirmed: true,
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 500 }],
    };
    expect(hasEstimateDraft(job)).toBe(false);
    expect(hasEstimateOnJob(job)).toBe(true);
  });

  it("detects local invoice draft", () => {
    const job = {
      invoiceLines: [{ itemName: "Service", qty: 1, unitPrice: 200 }],
    };
    expect(hasInvoiceDraft(job)).toBe(true);
    expect(hasInvoiceOnJob(job)).toBe(true);
  });
});