import { describe, expect, it } from "vitest";
import { parseSovCsv } from "../src/lib/sovParser.js";
import { buildG702, itemEarned, overallPct } from "../src/lib/requisitionCalc.js";
import { seedBaezProject } from "../src/lib/requisitionData.js";

describe("sovParser", () => {
  it("parses Baez SOV CSV with sections and line items", () => {
    const csv = `Martin Dorkin - Baez Place SOV,"$1,700,000.00",,,
Description,, Value ,Percentage
Electric Service Equipment,," $ 466,800.00 ",27%
Subcellar Floor,,,
,Roughing Lighting," $ 12,240.00 ",0.72%`;
    const parsed = parseSovCsv(csv);
    expect(parsed.contractSum).toBe(1700000);
    expect(parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(parsed.items[0].description).toBe("Electric Service Equipment");
    expect(parsed.items[0].value).toBe(466800);
    expect(parsed.items[1].section).toBe("Subcellar Floor");
  });
});

describe("requisitionCalc", () => {
  it("computes earned amount from completion %", () => {
    expect(itemEarned({ value: 10000, completedPct: 50 })).toBe(5000);
  });

  it("builds G702 with retainage and previous certs", () => {
    const project = seedBaezProject();
    project.items = project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 100 }));
    project.requisitions = [{ currentPaymentDue: 50000 }];
    const g702 = buildG702(project);
    expect(g702.originalContractSum).toBe(1700000);
    expect(g702.retainagePct).toBe(10);
    expect(g702.previousCertificates).toBe(50000);
    expect(g702.currentPaymentDue).toBeGreaterThan(0);
    expect(g702.g703.length).toBe(2);
  });

  it("overallPct rolls up line items", () => {
    const items = [
      { value: 100, completedPct: 100 },
      { value: 100, completedPct: 0 },
    ];
    expect(overallPct(items)).toBe(50);
  });
});