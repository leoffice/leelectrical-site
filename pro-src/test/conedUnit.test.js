import { describe, it, expect } from "vitest";
import {
  abbreviateConedUnit,
  applyConedUnitInput,
  clampConedUnit,
  CONED_UNIT_MAX_LEN,
} from "../src/lib/agencyForms/conedUnit.js";

describe("conedUnit abbreviation", () => {
  it("shortens apartment / floor words", () => {
    expect(abbreviateConedUnit("apartment one")).toBe("apt1");
    expect(abbreviateConedUnit("floor three")).toBe("fl3");
    expect(abbreviateConedUnit("Suite 2")).toMatch(/^ste2$/i);
  });

  it("hard-caps at 6 characters", () => {
    expect(clampConedUnit("abcdefghij").length).toBe(CONED_UNIT_MAX_LEN);
    expect(abbreviateConedUnit("apartment twelve B").length).toBeLessThanOrEqual(CONED_UNIT_MAX_LEN);
  });

  it("first pass auto-abbreviates free text", () => {
    const r = applyConedUnitInput({ nextValue: "apartment one" });
    expect(r.value).toBe("apt1");
    expect(r.autoApplied).toBe(true);
    expect(r.userCorrected).toBe(false);
  });

  it("second correction is left as the user typed (still capped)", () => {
    const first = applyConedUnitInput({ nextValue: "apartment one" });
    const second = applyConedUnitInput({
      prevValue: first.value,
      nextValue: "APTX99",
      alreadyAutoApplied: true,
    });
    expect(second.value).toBe("APTX99");
    expect(second.userCorrected).toBe(true);
  });
});
