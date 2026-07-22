import { describe, expect, it } from "vitest";
import { mergePaymentExtracts, pickPaymentAnalysis } from "../src/lib/paymentVision.js";

describe("pickPaymentAnalysis", () => {
  it("prefers check vision when text mentions check deposit", () => {
    const check = { amount: 1200, checkNumber: "5521", date: "2026-07-10", kind: "check" };
    const zelle = { amount: 1200, confirmationNumber: "JPM123", kind: "zelle" };
    const picked = pickPaymentAnalysis({
      checkResult: check,
      zelleResult: zelle,
      textHint: "this is a check deposit",
    });
    expect(picked.kind).toBe("check");
    expect(picked.extracted.checkNumber).toBe("5521");
  });

  it("prefers check result when it has check number but zelle only has amount", () => {
    const check = { amount: 800, checkNumber: "1042", kind: "check" };
    const zelle = { amount: 800, confirmationNumber: "", kind: "zelle" };
    const picked = pickPaymentAnalysis({ checkResult: check, zelleResult: zelle });
    expect(picked.kind).toBe("check");
    expect(picked.extracted.checkNumber).toBe("1042");
  });

  it("merges amount from zelle when check has # but missed the $ box", () => {
    // Root cause: dual vision — check pass scores high on checkNumber and used to drop zelle amount.
    const check = { amount: null, checkNumber: "1356", date: "2026-07-14", memo: "251843", kind: "check" };
    const zelle = { amount: 450, confirmationNumber: "", kind: "zelle" };
    const picked = pickPaymentAnalysis({
      checkResult: check,
      zelleResult: zelle,
      textHint: "check deposit",
    });
    expect(picked.kind).toBe("check");
    expect(picked.extracted.checkNumber).toBe("1356");
    expect(picked.extracted.amount).toBe(450);
  });

  it("mergePaymentExtracts fills empty primary fields from secondary", () => {
    const merged = mergePaymentExtracts(
      { amount: null, checkNumber: "99", kind: "check" },
      { amount: 1250.5, memo: "for job", kind: "zelle" }
    );
    expect(merged.amount).toBe(1250.5);
    expect(merged.checkNumber).toBe("99");
    expect(merged.memo).toBe("for job");
  });
});