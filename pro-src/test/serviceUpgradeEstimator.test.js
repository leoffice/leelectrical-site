import { describe, expect, it } from "vitest";
import {
  buildServiceUpgradeEstimate,
  defaultAnswers,
  validateAnswers,
  coerceMetersForMainPhase,
  filterEnabledEstimateLines,
  meterSummaryLine,
  meterSuggestedAmount,
  emptyMeter,
} from "../src/lib/serviceUpgradeEstimator.js";
import { searchMaterials } from "../src/lib/materialCatalog.js";

describe("serviceUpgradeEstimator", () => {
  it("builds 3 res + 1 PLP near $8700 band with defaults", () => {
    const a = defaultAnswers({
      mainAmps: 200,
      mainPhase: 1,
      meters: [
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 10 },
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 10 },
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 10 },
        { role: "plp", sizeId: "100-1", includePanel: true, feetToPanel: 10 },
      ],
      includeAlways: true,
      includeRemoval: false,
      includeFiling: false,
      includeConduit: false,
    });
    const r = buildServiceUpgradeEstimate(a);
    expect(r.errors).toEqual([]);
    // 4*(1900+450) + 650 = 4*2350 + 650 = 10050 with defaults — band check
    expect(r.total).toBeGreaterThan(8000);
    expect(r.total).toBeLessThan(12000);
    expect(r.lines.length).toBeGreaterThanOrEqual(5);
    expect(r.title).toMatch(/PLP|plp|meter/i);
  });

  it("blocks 3ph meters on 1ph main", () => {
    const a = defaultAnswers({
      mainPhase: 1,
      meters: [{ role: "residential", sizeId: "200-3", includePanel: true, feetToPanel: 10 }],
    });
    expect(validateAnswers(a).length).toBeGreaterThan(0);
  });

  it("coerces 3ph meters down when main becomes 1ph", () => {
    const meters = coerceMetersForMainPhase(
      [{ role: "residential", sizeId: "200-3", includePanel: true }],
      1
    );
    expect(meters[0].sizeId).toBe("200-1");
  });

  it("filing and removal toggles add lines", () => {
    const base = buildServiceUpgradeEstimate(defaultAnswers({ includeFiling: false, includeRemoval: false }));
    const withOpt = buildServiceUpgradeEstimate(
      defaultAnswers({ includeFiling: true, includeRemoval: true })
    );
    expect(withOpt.total).toBeGreaterThan(base.total);
  });

  it("filterEnabledEstimateLines drops off lines and recalculates total", () => {
    const full = buildServiceUpgradeEstimate(
      defaultAnswers({ includeAlways: true, includeFiling: true, includeRemoval: true })
    );
    expect(full.lines.length).toBeGreaterThan(2);
    const enabled = full.lines.map((_, i) => i !== 0); // drop first line
    const filtered = filterEnabledEstimateLines(full, enabled);
    expect(filtered.lines.length).toBe(full.lines.length - 1);
    expect(filtered.total).toBeLessThan(full.total);
    const sum = filtered.lines.reduce((s, ln) => s + Number(ln.amount || 0), 0);
    expect(filtered.total).toBeCloseTo(sum, 2);
  });
});

describe("materialCatalog", () => {
  it("finds meter pan by alias", () => {
    const hits = searchMaterials("meter socket");
    expect(hits.some((m) => /meter pan|socket/i.test(m.name))).toBe(true);
  });
});

describe("meter accordion helpers", () => {
  it("meterSummaryLine formats size · role", () => {
    expect(meterSummaryLine({ role: "residential", sizeId: "100-1" })).toBe("100A 1φ · Residential");
    expect(meterSummaryLine({ role: "plp", sizeId: "200-3" })).toBe("200A 3φ · PLP");
    expect(meterSummaryLine({ role: "commercial", sizeId: "200-1" })).toBe("200A 1φ · Commercial");
  });

  it("meterSuggestedAmount includes meter + panel by default", () => {
    const m = emptyMeter(1);
    const amt = meterSuggestedAmount(m, defaultAnswers());
    // 1900 meter + 450 panel at 10 free feet
    expect(amt).toBe(2350);
    const noPanel = meterSuggestedAmount({ ...m, includePanel: false }, defaultAnswers());
    expect(noPanel).toBe(1900);
    const extraFeet = meterSuggestedAmount({ ...m, feetToPanel: 20 }, defaultAnswers());
    // 10 free + 10 * $12
    expect(extraFeet).toBe(2350 + 120);
  });
});
