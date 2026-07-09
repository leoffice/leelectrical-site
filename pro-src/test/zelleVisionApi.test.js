import { describe, expect, it } from "vitest";
import {
  normalizeExtracted,
  parseVisionJson,
} from "../../netlify/functions/lib/zelleVision.mjs";

describe("parseVisionJson", () => {
  it("parses raw JSON", () => {
    const o = parseVisionJson('{"amount":2300,"confirmationNumber":"JPM1"}');
    expect(o.amount).toBe(2300);
  });
  it("parses fenced JSON", () => {
    const o = parseVisionJson('```json\n{"amount":100}\n```');
    expect(o.amount).toBe(100);
  });
});

describe("normalizeExtracted", () => {
  it("normalizes amount and date", () => {
    const n = normalizeExtracted({
      amount: "$2,300",
      confirmationNumber: " JPM99 ",
      date: "07/09/26",
      memo: "inv 251841",
      confidence: "high",
    });
    expect(n.amount).toBe(2300);
    expect(n.confirmationNumber).toBe("JPM99");
    expect(n.date).toBe("2026-07-09");
    expect(n.confidence).toBe("high");
  });
});