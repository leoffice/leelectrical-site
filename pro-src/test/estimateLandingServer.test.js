import { describe, expect, it } from "vitest";
import {
  buildDepositJobFromPayload,
  createInvoicePayloadFromJob,
  depositInvoiceNo,
  isEstimatePayload,
  progressBillLines,
} from "../../netlify/functions/lib/estimateLanding.mjs";

const payload = {
  k: "e",
  j: "local-1",
  i: "25499",
  en: "25499",
  a: 1000,
  c: "Test",
  e: "t@x.com",
  lines: [{ itemName: "Work", description: "Work", qty: 2, unitPrice: 500 }],
  dp: 50,
};

describe("estimateLanding server helpers", () => {
  it("detects estimate payload", () => {
    expect(isEstimatePayload(payload)).toBe(true);
    expect(isEstimatePayload({ k: "i", i: "1" })).toBe(false);
  });

  it("builds deposit invoice number from estimate", () => {
    expect(depositInvoiceNo("25499")).toBe("D-25499");
  });

  it("scales qty for 50% deposit", () => {
    const lines = progressBillLines(payload.lines, 50);
    expect(lines[0].qty).toBe(1);
    expect(lines[0].unitPrice).toBe(500);
    expect(lines[0].amount).toBe(500);
  });

  it("builds deposit job + QBO create payload", () => {
    const job = buildDepositJobFromPayload(payload, { depositPct: 50 });
    expect(job.invoiceNo).toBe("D-25499");
    expect(job.amount).toBe(500);
    const cmd = createInvoicePayloadFromJob(job, { progressPct: 50 });
    expect(cmd.source).toBe("estimate");
    expect(cmd.estimateNo).toBe("25499");
    expect(cmd.progressBilling).toBe(true);
    expect(cmd.lines[0].qty).toBe(1);
  });
});
