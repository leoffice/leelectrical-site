import { describe, expect, it } from "vitest";
import {
  buildPaymentVisionLearningEntry,
  computePaymentVisionDelta,
  formatLearningForPrompt,
  hasPaymentVisionLearning,
  normalizeLearningValue,
} from "../src/lib/paymentVisionLearning.js";

describe("normalizeLearningValue", () => {
  it("strips $ from amount", () => {
    expect(normalizeLearningValue("amount", "$1,250.50")).toBe("1250.5");
  });
  it("digits-only check numbers", () => {
    expect(normalizeLearningValue("checkNumber", "No. 4521")).toBe("4521");
  });
});

describe("computePaymentVisionDelta", () => {
  it("records field corrections when Levi edits vision", () => {
    const deltas = computePaymentVisionDelta(
      { amount: 400, checkNumber: "1001", date: "2026-07-20" },
      { amount: 450, ref: "1002", date: "2026-07-20", memo: "" },
      "check"
    );
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "amount", vision: "400", approved: "450", kind: "field_correction" }),
        expect.objectContaining({ field: "checkNumber", vision: "1001", approved: "1002" }),
      ])
    );
  });

  it("records vision_missed when extract empty and Levi fills check #", () => {
    const deltas = computePaymentVisionDelta(
      null,
      { amount: 450, ref: "7788", openBalanceDefault: 450 },
      "check"
    );
    expect(deltas.some((d) => d.field === "amount")).toBe(false); // prefilled open balance
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "checkNumber", kind: "vision_missed", vision: null, approved: "7788" }),
      ])
    );
  });

  it("trains amount when vision missed and amount differs from open balance", () => {
    const deltas = computePaymentVisionDelta(
      {},
      { amount: 300, ref: "1", openBalanceDefault: 450 },
      "check"
    );
    expect(deltas.find((d) => d.field === "amount")).toMatchObject({
      kind: "vision_missed",
      approved: "300",
    });
  });
});

describe("formatLearningForPrompt", () => {
  it("builds few-shot text from entries", () => {
    const text = formatLearningForPrompt(
      [
        {
          kind: "check",
          deltas: [
            { field: "checkNumber", vision: null, approved: "4521", kind: "vision_missed" },
            { field: "amount", vision: "400", approved: "450", kind: "field_correction" },
          ],
        },
      ],
      "check"
    );
    expect(text).toContain("Levi's recent corrections");
    expect(text).toContain("checkNumber");
    expect(text).toContain("4521");
    expect(text).toContain("450");
  });

  it("empty when no entries", () => {
    expect(formatLearningForPrompt([])).toBe("");
  });
});

describe("buildPaymentVisionLearningEntry", () => {
  it("returns null when nothing changed", () => {
    expect(
      buildPaymentVisionLearningEntry({
        kind: "check",
        extracted: { amount: 450, checkNumber: "9" },
        finalFields: { amount: 450, ref: "9" },
      })
    ).toBeNull();
  });

  it("returns entry with deltas", () => {
    const entry = buildPaymentVisionLearningEntry({
      kind: "check",
      extracted: { amount: 100 },
      finalFields: { amount: 200, ref: "55" },
      jobId: "j1",
      proofName: "c.jpg",
    });
    expect(hasPaymentVisionLearning(entry.deltas)).toBe(true);
    expect(entry.kind).toBe("check");
    expect(entry.proofName).toBe("c.jpg");
  });
});
