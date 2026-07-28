import { describe, expect, it } from "vitest";
import {
  canClearDoc,
  clearDocLabel,
  clearEstimatePatch,
  clearInvoicePatch,
  deleteDocLabel,
} from "../src/lib/deleteDoc.js";

describe("deleteDoc clear helpers", () => {
  it("clearEstimatePatch wipes estimate fields only", () => {
    const p = clearEstimatePatch();
    expect(p.estimateNo).toBe("");
    expect(p.estimateLines).toEqual([]);
    expect(p._estimateConfirmed).toBe(false);
    expect(p.invoiceNo).toBeUndefined();
  });

  it("clearInvoicePatch wipes invoice fields only", () => {
    const p = clearInvoicePatch();
    expect(p.invoiceNo).toBe("");
    expect(p.invoiceLines).toEqual([]);
    expect(p._invoiceConfirmed).toBe(false);
    expect(p.paid).toBe(false);
    expect(p.estimateNo).toBeUndefined();
  });

  it("canClearDoc detects drafts and numbered docs", () => {
    expect(canClearDoc({ estimateLines: [{ itemName: "X" }] }, "estimate")).toBe(true);
    expect(canClearDoc({ estimateNo: "25484" }, "estimate")).toBe(true);
    expect(canClearDoc({}, "estimate")).toBe(false);
    expect(canClearDoc({ invoiceLines: [{ itemName: "Y" }] }, "invoice")).toBe(true);
    expect(canClearDoc({ invoiceNo: "251800" }, "invoice")).toBe(true);
    expect(canClearDoc({}, "invoice")).toBe(false);
  });

  it("clearDocLabel prefers numbers, else draft", () => {
    expect(clearDocLabel({ estimateNo: "25484" }, "estimate")).toBe("estimate #25484");
    expect(clearDocLabel({}, "estimate")).toBe("estimate draft");
    expect(clearDocLabel({ invoiceNo: "99" }, "invoice")).toBe("invoice #99");
    expect(clearDocLabel({}, "invoice")).toBe("invoice draft");
  });

  it("deleteDocLabel still names whole-job delete", () => {
    expect(deleteDocLabel({ invoiceNo: "1" })).toBe("invoice #1");
    expect(deleteDocLabel({ estimateNo: "2" })).toBe("estimate #2");
  });
});
