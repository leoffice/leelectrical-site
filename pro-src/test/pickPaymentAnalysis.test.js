import { describe, expect, it } from "vitest";
import { pickPaymentAnalysis } from "../src/lib/paymentVision.js";

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
});