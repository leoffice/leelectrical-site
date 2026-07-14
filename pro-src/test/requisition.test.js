import { describe, expect, it } from "vitest";
import { parseSovCsv } from "../src/lib/sovParser.js";
import { buildG702, itemEarned, overallPct } from "../src/lib/requisitionCalc.js";
import { seedBaezProject } from "../src/lib/requisitionData.js";
import {
  applyCarriedPercentages,
  buildRequisitionEmail,
  createRequisitionRecord,
  pctChangeStatus,
  paymentNeedsInfo,
  previousItemSnapshot,
  requisitionBalance,
} from "../src/lib/requisitionHelpers.js";
import { buildRequisitionPdf } from "../src/lib/requisitionPdf.js";

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

describe("requisitionHelpers", () => {
  it("pctChangeStatus flags unchanged vs changed", () => {
    expect(pctChangeStatus(50, 50, true)).toBe("unchanged");
    expect(pctChangeStatus(60, 50, true)).toBe("changed");
    expect(pctChangeStatus(50, 0, false)).toBe("new");
  });

  it("previousItemSnapshot reads last submitted requisition", () => {
    const project = seedBaezProject();
    project.requisitions = [
      { id: "r1", status: "submitted", itemsSnapshot: [{ id: "item-1", completedPct: 40 }] },
    ];
    const snap = previousItemSnapshot(project);
    expect(snap["item-1"]).toBe(40);
  });

  it("applyCarriedPercentages seeds new req from last submitted snapshot", () => {
    const project = seedBaezProject();
    project.items = project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 0 }));
    project.requisitions = [
      { id: "r1", status: "submitted", itemsSnapshot: [{ id: "item-1", completedPct: 55 }, { id: "item-2", completedPct: 30 }] },
    ];
    const next = applyCarriedPercentages(project);
    expect(next.items[0].completedPct).toBe(55);
    expect(next.items[1].completedPct).toBe(30);
  });

  it("createRequisitionRecord captures G702 fields", () => {
    const project = seedBaezProject();
    const draft = { ...project, items: project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 50 })) };
    const req = createRequisitionRecord(project, draft, { periodTo: "2026-07-14", num: 13 });
    expect(req.num).toBe(13);
    expect(req.applicationNumber).toBe("REQ-13");
    expect(req.g703.length).toBe(2);
    expect(req.currentPaymentDue).toBeGreaterThan(0);
  });

  it("requisitionBalance subtracts payments", () => {
    const req = { currentPaymentDue: 100000, payments: [{ amount: 40000 }, { amount: 60000 }] };
    expect(requisitionBalance(req)).toBe(0);
  });

  it("paymentNeedsInfo flags missing date or check", () => {
    expect(paymentNeedsInfo({ amount: 100, date: "", checkNumber: "" })).toBe(true);
    expect(paymentNeedsInfo({ amount: 100, date: "2026-01-01", checkNumber: "123" })).toBe(false);
  });

  it("buildRequisitionEmail includes key amounts", () => {
    const project = seedBaezProject();
    const req = { applicationNumber: "REQ-12", currentPaymentDue: 108000, previousCertificates: 1470000, totalCompleted: 1600000, periodTo: "2026-07-01" };
    const email = buildRequisitionEmail({ project, requisition: req, contact: { email: "gc@test.com" } });
    expect(email.subject).toContain("REQ-12");
    expect(email.body).toContain("108,000");
    expect(email.to).toBe("gc@test.com");
  });
});

describe("requisitionPdf", () => {
  it("builds a PDF blob for G702/G703", () => {
    const project = seedBaezProject();
    const req = createRequisitionRecord(project, {
      ...project,
      items: project.items.slice(0, 3).map((it) => ({ ...it, completedPct: 25 })),
    });
    const blob = buildRequisitionPdf(project, req);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
  });
});