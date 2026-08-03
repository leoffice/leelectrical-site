import { describe, expect, it } from "vitest";
import {
  buildServiceUpgradeEstimate,
  defaultAnswers,
  validateAnswers,
  coerceMetersForMainPhase,
  filterEnabledEstimateLines,
  meterSummaryLine,
  meterSuggestedAmount,
  meterFeeForIndex,
  emptyMeter,
  DEFAULT_FEES,
  mainServicePerFoot,
} from "../src/lib/serviceUpgradeEstimator.js";
import { searchMaterials } from "../src/lib/materialCatalog.js";

describe("serviceUpgradeEstimator", () => {
  it("first 100A meter is $1900 band; additional meters use $1650", () => {
    expect(meterFeeForIndex("100-1", 0)).toBe(1900);
    expect(meterFeeForIndex("100-1", 1)).toBe(1650);
    expect(meterFeeForIndex("100-1", 2)).toBe(1650);
  });

  it("builds multi-meter estimate with tiered rates", () => {
    const a = defaultAnswers({
      mainAmps: 200,
      mainPhase: 1,
      meters: [
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
        { role: "plp", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
      ],
      includeAlways: true,
      includeRemoval: false,
      includeFiling: false,
      includeConduit: false,
    });
    const r = buildServiceUpgradeEstimate(a);
    expect(r.errors).toEqual([]);
    // 1900 + 3*1650 meters + 450 first panel + 3*450 add panels + 650 always
    // = 1900+4950 + 450+1350 + 650 = 9300
    expect(r.total).toBeGreaterThan(8000);
    expect(r.total).toBeLessThan(12000);
    // Main work is one Service Upgrade line
    expect(r.lines.some((l) => /Service Upgrade/i.test(l.itemName))).toBe(true);
    expect(r.lines[0].description).toMatch(/SCOPE/i);
  });

  it("blocks 3ph meters on 1ph main", () => {
    const a = defaultAnswers({
      mainPhase: 1,
      meters: [{ role: "residential", sizeId: "200-3", includePanel: true, feetToPanel: 1 }],
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

  it("removal is $400 and filing is a separate line", () => {
    expect(DEFAULT_FEES.removalDisposal).toBe(400);
    const withOpt = buildServiceUpgradeEstimate(
      defaultAnswers({ includeFiling: true, includeRemoval: true })
    );
    const removal = withOpt.lines.find((l) => /Removal/i.test(l.itemName));
    const filing = withOpt.lines.find((l) => /Filing/i.test(l.itemName));
    expect(removal?.amount).toBe(400);
    expect(filing?.amount).toBe(1800);
  });

  it("extra meter→panel feet increase price", () => {
    const base = buildServiceUpgradeEstimate(
      defaultAnswers({
        meters: [{ role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 }],
      })
    );
    const more = buildServiceUpgradeEstimate(
      defaultAnswers({
        meters: [{ role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 11 }],
      })
    );
    expect(more.total).toBeGreaterThan(base.total);
    // 10 extra ft * $35
    expect(more.total - base.total).toBe(350);
  });

  it("main service line is $200/ft at 100A and scales with main amp", () => {
    expect(mainServicePerFoot(100)).toBe(200);
    expect(mainServicePerFoot(200)).toBe(260);
    const zero = buildServiceUpgradeEstimate(defaultAnswers({ mainAmps: 100, feetMainService: 0 }));
    const ten = buildServiceUpgradeEstimate(defaultAnswers({ mainAmps: 100, feetMainService: 10 }));
    expect(ten.total - zero.total).toBe(2000);
    expect(ten.lines[0].description).toMatch(/Main service line to metering equipment: 10 ft/);
  });

  it("scope omits meter→panel distance when 3 ft or less", () => {
    const short = buildServiceUpgradeEstimate(
      defaultAnswers({
        meters: [{ role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 2 }],
      })
    );
    expect(short.lines[0].description).not.toMatch(/ft meter→panel/);
    const long = buildServiceUpgradeEstimate(
      defaultAnswers({
        meters: [{ role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 5 }],
      })
    );
    expect(long.lines[0].description).toMatch(/5 ft meter→panel/);
  });

  it("filterEnabledEstimateLines drops off lines and recalculates total", () => {
    const full = buildServiceUpgradeEstimate(
      defaultAnswers({ includeAlways: true, includeFiling: true, includeRemoval: true })
    );
    expect(full.lines.length).toBeGreaterThan(1);
    const enabled = full.lines.map((_, i) => i !== 0);
    const filtered = filterEnabledEstimateLines(full, enabled);
    expect(filtered.lines.length).toBe(full.lines.length - 1);
    expect(filtered.total).toBeLessThan(full.total);
  });
});

describe("materialCatalog", () => {
  it("finds meter pan by alias", () => {
    const hits = searchMaterials("meter socket");
    expect(hits.some((m) => /meter pan|socket/i.test(m.name))).toBe(true);
  });
});

describe("meter accordion helpers", () => {
  it("meterSummaryLine includes feet", () => {
    expect(meterSummaryLine({ role: "residential", sizeId: "100-1", feetToPanel: 1 })).toMatch(
      /100A 1φ · Residential · 1 ft/
    );
  });

  it("meterSuggestedAmount first vs additional", () => {
    const a = defaultAnswers({
      meters: [
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
        { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
      ],
    });
    const first = meterSuggestedAmount(a.meters[0], a, 0);
    const second = meterSuggestedAmount(a.meters[1], a, 1);
    // first: 1900+450, second: 1650+450
    expect(first).toBe(2350);
    expect(second).toBe(2100);
  });
});
