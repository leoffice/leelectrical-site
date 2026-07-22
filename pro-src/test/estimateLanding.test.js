import { describe, expect, it } from "vitest";
import {
  buildDepositInvoiceJob,
  buildEstimateJobFromPayload,
  buildEstimatePdfBlobFromPayload,
  depositAmountFromPayload,
  depositPctFromPayload,
  formatDepositCta,
  isEstimateLanding,
} from "../src/lib/estimateLanding.js";
import { isEstimateLanding as payIsEstimate, decodePayLanding, encodePayLanding } from "../src/lib/payLanding.js";

const estimatePayload = {
  k: "e",
  j: "local-1",
  i: "25499",
  en: "25499",
  a: 1000,
  t: "$1,000.00",
  c: "Test Customer",
  e: "test@example.com",
  w: "Panel upgrade",
  sa: "1 Main St",
  ba: "1 Main St",
  sl: "blzelectric",
  dp: 50,
  lines: [
    { itemName: "Service", description: "Panel upgrade", qty: 1, unitPrice: 1000 },
  ],
};

describe("estimate landing helpers", () => {
  it("detects estimate payloads", () => {
    expect(isEstimateLanding(estimatePayload)).toBe(true);
    expect(payIsEstimate(estimatePayload)).toBe(true);
    expect(isEstimateLanding({ i: "1", pay: "https://x", sl: "blzelectric" })).toBe(false);
  });

  it("computes 50% deposit from lines", () => {
    expect(depositPctFromPayload(estimatePayload)).toBe(50);
    expect(depositAmountFromPayload(estimatePayload, 50)).toBe(500);
  });

  it("builds a deposit invoice job with half qty", () => {
    const job = buildDepositInvoiceJob(estimatePayload, { depositPct: 50, invoiceNo: "D-25499" });
    expect(job.invoiceNo).toBe("D-25499");
    expect(job.estimateNo).toBe("25499");
    expect(job.invoiceLines[0].qty).toBe(0.5);
    expect(job.invoiceLines[0].unitPrice).toBe(1000);
    expect(job.amount).toBe(500);
  });

  it("formats the deposit CTA", () => {
    expect(formatDepositCta(500, 50)).toMatch(/50% Deposit/);
    expect(formatDepositCta(500, 50)).toMatch(/\$500/);
  });

  it("encodes estimate tokens for long-link fallback", () => {
    const token = encodePayLanding(estimatePayload);
    const decoded = decodePayLanding(token);
    expect(decoded.k).toBe("e");
    expect(decoded.i).toBe("25499");
    expect(decoded.lines).toHaveLength(1);
  });

  it("maps landing payload to a job for client PDF (store-miss fallback)", () => {
    const job = buildEstimateJobFromPayload(estimatePayload);
    expect(job.estimateNo).toBe("25499");
    expect(job.customer).toBe("Test Customer");
    expect(job.estimateLines).toHaveLength(1);
    expect(job.amount).toBe(1000);
  });

  it("builds an estimate PDF blob from payload when docs store is empty", () => {
    const built = buildEstimatePdfBlobFromPayload(estimatePayload);
    expect(built.ok).toBe(true);
    expect(built.blob).toBeTruthy();
    expect(built.blob.type || built.blob.constructor?.name).toBeTruthy();
    expect(built.job.estimateNo).toBe("25499");
  });
});
