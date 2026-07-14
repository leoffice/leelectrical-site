import { describe, expect, it } from "vitest";
import { parseSovCsv } from "../src/lib/sovParser.js";
import { buildG702, isChangeOrderItem, itemEarned, overallPct, requisitionItems } from "../src/lib/requisitionCalc.js";
import { seedBaezProject } from "../src/lib/requisitionData.js";
import {
  applyCarriedPercentages,
  buildRequisitionEmail,
  canHardDeleteRequisition,
  carriedPctForItem,
  completionBreakdown,
  createRequisitionRecord,
  nextRequisitionNum,
  pctChangeStatus,
  paymentNeedsInfo,
  previousItemSnapshot,
  previousPctByItemId,
  removeRequisition,
  requisitionBalance,
  requisitionDeleteMode,
  sumPriorPayments,
  sovItemKey,
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
    project.requisitions = [{ currentPaymentDue: 50000, status: "submitted" }];
    const g702 = buildG702(project);
    expect(g702.originalContractSum).toBe(1700000);
    expect(g702.retainagePct).toBe(10);
    expect(g702.previousCertificates).toBe(50000);
    expect(g702.currentPaymentDue).toBeGreaterThan(0);
    expect(g702.g703.length).toBe(2);
  });

  it("keeps previous certs + current due aligned with earned less retainage", () => {
    const project = seedBaezProject();
    project.items = project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 100 }));
    project.requisitions = [
      { currentPaymentDue: 900000, status: "submitted" },
      { currentPaymentDue: 900000, status: "submitted" },
    ];
    const g702 = buildG702(project);
    const earned = g702.totalCompleted - g702.totalRetainage;
    expect(g702.previousCertificates + g702.currentPaymentDue).toBe(earned);
    expect(g702.currentPaymentDue).toBe(0);
  });

  it("caps total completed at contract sum to date", () => {
    const project = {
      contractSum: 100,
      changeOrders: 0,
      retainagePct: 10,
      items: [{ id: "a", value: 100, completedPct: 150 }],
      requisitions: [],
    };
    const g702 = buildG702(project);
    expect(g702.totalCompleted).toBe(100);
  });

  it("detects change-order SOV lines", () => {
    expect(isChangeOrderItem({ description: "CO - 01" })).toBe(true);
    expect(isChangeOrderItem({ description: "Roughing" })).toBe(false);
  });

  it("excludes change-order lines from requisition G703 by default", () => {
    const project = {
      contractSum: 1000,
      changeOrders: 200,
      retainagePct: 10,
      items: [
        { id: "a", description: "Roughing", value: 1000, completedPct: 50 },
        { id: "b", description: "CO - 02", value: 200, completedPct: 100 },
      ],
      requisitions: [],
    };
    const g702 = buildG702(project);
    expect(g702.g703).toHaveLength(1);
    expect(g702.g703[0].description).toContain("Roughing");
    expect(g702.contractSumToDate).toBe(1000);
    expect(requisitionItems(project.items)).toHaveLength(1);
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
      { id: "r1", num: 1, status: "submitted", itemsSnapshot: [{ id: "item-1", completedPct: 40 }] },
    ];
    const snap = previousItemSnapshot(project);
    expect(snap.byId["item-1"]).toBe(40);
    expect(previousPctByItemId(project)["item-1"]).toBe(40);
  });

  it("carriedPctForItem matches by section|description when ids differ", () => {
    const snap = previousItemSnapshot({
      requisitions: [
        {
          id: "r1",
          num: 1,
          status: "submitted",
          itemsSnapshot: [
            {
              id: "old-1",
              section: "Subcellar Floor",
              description: "Roughing Lighting",
              completedPct: 72,
            },
          ],
        },
      ],
    });
    const it = { id: "item-99", section: "Subcellar Floor", description: "Roughing Lighting" };
    expect(carriedPctForItem(it, snap)).toBe(72);
    expect(sovItemKey(it)).toBe("subcellar floor|roughing lighting");
  });

  it("nextRequisitionNum uses max num not array length", () => {
    const project = { requisitions: [{ num: 12 }, { num: 5 }] };
    expect(nextRequisitionNum(project)).toBe(13);
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

  it("sumPriorPayments skips void requisitions", () => {
    const reqs = [
      { num: 1, currentPaymentDue: 100, status: "submitted" },
      { num: 2, currentPaymentDue: 200, status: "void" },
      { num: 3, currentPaymentDue: 50, status: "submitted" },
    ];
    expect(sumPriorPayments(reqs, 3)).toBe(100);
    expect(sumPriorPayments(reqs)).toBe(150);
  });

  it("completionBreakdown splits base contract and change orders", () => {
    const items = [
      { description: "Roughing", value: 1000, completedPct: 50 },
      { description: "CO - 01", value: 100, completedPct: 100 },
    ];
    const b = completionBreakdown(items);
    expect(b.baseCompleted).toBe(500);
    expect(b.coCompleted).toBe(100);
    expect(b.totalCompleted).toBe(600);
  });

  it("only the latest requisition can be hard-deleted", () => {
    const project = {
      requisitions: [
        { id: "r1", num: 1, status: "submitted" },
        { id: "r2", num: 2, status: "submitted" },
      ],
    };
    expect(requisitionDeleteMode(project, project.requisitions[0])).toBe("blocked");
    expect(canHardDeleteRequisition(project, project.requisitions[1])).toBe(true);
    const next = removeRequisition(project, "r2");
    expect(next.requisitions).toHaveLength(1);
  });

  it("buildRequisitionEmail includes key amounts, subject, and signature", () => {
    const project = seedBaezProject();
    const req = { applicationNumber: "REQ-12", currentPaymentDue: 108000, previousCertificates: 1470000, totalCompleted: 1600000, periodTo: "2026-07-01" };
    const email = buildRequisitionEmail({
      project,
      requisition: req,
      contact: { email: "gc@test.com" },
      attachments: [{ name: "invoice.pdf" }],
    });
    expect(email.subject).toContain("REQ-12");
    expect(email.body).toContain("108,000");
    expect(email.body).toContain("invoice.pdf");
    expect(email.to).toBe("gc@test.com");
    expect(email.signature).toContain("Office@LeElectrical.us");
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