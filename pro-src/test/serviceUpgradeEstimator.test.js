import { describe, expect, it } from "vitest";
import {
  buildServiceUpgradeEstimate,
  defaultAnswers,
  validateAnswers,
  coerceMetersForMainPhase,
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
});

describe("materialCatalog", () => {
  it("finds meter pan by alias", () => {
    const hits = searchMaterials("meter socket");
    expect(hits.some((m) => /meter pan|socket/i.test(m.name))).toBe(true);
  });
});
