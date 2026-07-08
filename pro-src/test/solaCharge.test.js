import { describe, expect, it } from "vitest";
import { chargePreview, normalizeCardExp } from "../src/lib/solaCharge.js";

describe("solaCharge", () => {
  it("normalizeCardExp accepts MM/YY and MMYY", () => {
    expect(normalizeCardExp("12/28")).toBe("1228");
    expect(normalizeCardExp("1228")).toBe("1228");
    expect(normalizeCardExp("")).toBe("");
  });

  it("chargePreview adds 3.5% fee when enabled", () => {
    const withFee = chargePreview(1000, true);
    expect(withFee.principal).toBe(1000);
    expect(withFee.charge).toBe(1035);
    const noFee = chargePreview(1000, false);
    expect(noFee.charge).toBe(1000);
  });
});