// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_FEES,
  feesFor,
  mergeFees,
  getFeeAtPath,
  setFeeAtPath,
  buildServiceUpgradeEstimate,
  defaultAnswers,
} from "../src/lib/serviceUpgradeEstimator.js";
import {
  getEstimateGeneratorFees,
  setEstimateGeneratorFees,
  ESTIMATE_GENERATOR_FEES_KEY,
} from "../src/lib/appSettings.js";

describe("estimate generator fees (Settings)", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
      localStorage.removeItem(ESTIMATE_GENERATOR_FEES_KEY);
    } catch {
      /* ignore */
    }
  });

  it("mergeFees keeps nested meter keys when only one size is overridden", () => {
    const merged = mergeFees(DEFAULT_FEES, { meter: { "100-1": 9999 } });
    expect(merged.meter["100-1"]).toBe(9999);
    expect(merged.meter["200-1"]).toBe(DEFAULT_FEES.meter["200-1"]);
    expect(merged.filing).toBe(DEFAULT_FEES.filing);
  });

  it("getFeeAtPath / setFeeAtPath round-trip", () => {
    expect(getFeeAtPath(DEFAULT_FEES, "meter.100-1")).toBe(DEFAULT_FEES.meter["100-1"]);
    const o = setFeeAtPath({}, "meter.100-1", 2100);
    expect(o.meter["100-1"]).toBe(2100);
  });

  it("Settings fees raise Service Upgrade totals", () => {
    setEstimateGeneratorFees({ filing: 5000, meter: { "100-1": 5000 } });
    expect(getEstimateGeneratorFees().filing).toBe(5000);

    const a = defaultAnswers({
      includeFiling: true,
      meters: [{ role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 }],
    });
    const r = buildServiceUpgradeEstimate(a);
    const filingLine = r.lines.find((l) => /Filing/i.test(l.itemName || ""));
    expect(filingLine?.unitPrice).toBe(5000);
    // feesFor deep-merges so other meter sizes still resolve
    expect(feesFor(a).meter["200-1"]).toBe(DEFAULT_FEES.meter["200-1"]);
  });
});
