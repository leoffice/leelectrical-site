import { describe, expect, it } from "vitest";
import { chargePreview, formatCardExpInput, normalizeCardExp } from "../src/lib/solaCharge.js";

describe("solaCharge", () => {
  it("formatCardExpInput formats digits as MM/YY while typing", () => {
    expect(formatCardExpInput("")).toBe("");
    expect(formatCardExpInput("1")).toBe("1");
    expect(formatCardExpInput("12")).toBe("12");
    expect(formatCardExpInput("123")).toBe("12/3");
    expect(formatCardExpInput("12/28")).toBe("12/28");
    expect(formatCardExpInput("122820")).toBe("12/28");
  });

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