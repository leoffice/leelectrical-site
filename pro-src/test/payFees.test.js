import { describe, expect, it } from "vitest";
import { fmtMoneyPrecise, processingFee, totalWithFee } from "../src/lib/payFees.js";

describe("payFees", () => {
  it("adds 3.5% on top", () => {
    expect(processingFee(10000)).toBe(350);
    expect(totalWithFee(10000)).toBe(10350);
    expect(fmtMoneyPrecise(totalWithFee(652))).toBe("$674.82");
  });
});