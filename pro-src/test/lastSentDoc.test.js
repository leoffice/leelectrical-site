import { describe, expect, it } from "vitest";
import {
  buildLastSentDocPatch,
  faceDiffersFromLastSent,
  slimSentLines,
} from "../src/lib/lastSentDoc.js";
import { parseAmount } from "../src/lib/format.js";
import { linesTotal } from "../src/lib/qboDoc.js";

describe("lastSentDoc — lock face to emailed total (Izzy #201971)", () => {
  const baseJob = {
    id: "local-izzy",
    estimateNo: "201971",
    amount: "$8,860",
    contractAmount: 8860,
    email: "izzybcorp@gmail.com",
    estimateLines: [
      { itemName: "Service Upgrade", qty: 1, unitPrice: 6860 },
      { itemName: "Removal", qty: 1, unitPrice: 400 },
      { itemName: "Filing", qty: 1, unitPrice: 1600 },
    ],
    invoiceHistory: [
      { date: "2026-08-07", to: "izzybcorp@gmail.com", kind: "Estimate #201971 emailed (local PDF)" },
    ],
  };

  const sentLines = [
    { itemName: "Service Upgrade", qty: 1, unitPrice: 6150, amount: 6150 },
    { itemName: "Removal", qty: 1, unitPrice: 0, amount: 0 },
    { itemName: "Filing", qty: 1, unitPrice: 1600, amount: 1600 },
  ];

  it("buildLastSentDocPatch stamps estimate amount + lines to emailed total", () => {
    const patch = buildLastSentDocPatch(baseJob, {
      kind: "estimate",
      amount: 7750,
      lines: sentLines,
      to: "izzybcorp@gmail.com",
      docNo: "201971",
      kindLabel: "Estimate #201971 emailed (local PDF) — $7,750",
    });
    expect(parseAmount(patch.amount)).toBe(7750);
    expect(patch.contractAmount).toBe(7750);
    expect(patch.estimateEmailedAt).toBeTruthy();
    expect(patch._docEmailed).toBe(true);
    expect(patch.lastSentDoc.amount).toBe(7750);
    expect(patch.lastSentDoc.docNo).toBe("201971");
    expect(linesTotal(patch.estimateLines)).toBe(7750);
    expect(patch.invoiceHistory).toHaveLength(2);
    expect(patch.invoiceHistory[1].amount).toBe(7750);
  });

  it("slimSentLines keeps zero-dollar waived lines at unitPrice 0", () => {
    const slim = slimSentLines(sentLines);
    expect(slim[1].unitPrice).toBe(0);
    expect(linesTotal(slim)).toBe(7750);
  });

  it("faceDiffersFromLastSent detects stale draft vs last email", () => {
    expect(faceDiffersFromLastSent({ amount: "$8,860", lastSentDoc: { amount: 7750 } })).toBe(true);
    expect(faceDiffersFromLastSent({ amount: "$7,750", lastSentDoc: { amount: 7750 } })).toBe(false);
    expect(faceDiffersFromLastSent({ amount: "$8,860" })).toBe(false);
  });

  it("invoice path stamps invoice lines without contractAmount", () => {
    const patch = buildLastSentDocPatch(
      { ...baseJob, invoiceNo: "251900", estimateNo: "" },
      {
        kind: "invoice",
        amount: 1200,
        lines: [{ itemName: "Work", qty: 1, unitPrice: 1200 }],
        docNo: "251900",
      }
    );
    expect(parseAmount(patch.amount)).toBe(1200);
    expect(patch.invoiceLines).toHaveLength(1);
    expect(patch.estimateLines).toBeUndefined();
    expect(patch.invoiceEmailedAt).toBeTruthy();
  });
});
