import { describe, expect, it } from "vitest";
import { parseSovCsv } from "../src/lib/sovParser.js";
import { buildG702, isChangeOrderItem, itemEarned, overallPct, requisitionItems } from "../src/lib/requisitionCalc.js";
import { fmtUsd, seedBaezProject } from "../src/lib/requisitionData.js";
import {
  applyCarriedPercentages,
  setAllRequisitionItemsComplete,
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
  reconcileRequisitionFinancials,
  removeRequisition,
  requisitionBalance,
  requisitionDeleteMode,
  sumPriorPayments,
  sovItemKey,
  updateRequisitionPercentages,
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

  it("drops mistaken CO lines from the progress SOV", () => {
    const csv = `Project SOV,"$1,030.00",,,
Description,, Value ,Percentage
General,,,
,Roughing," $ 1,000.00 ",97%
,CO1," $ 20.00 ",2%
,CO - 02," $ 10.00 ",1%`;
    const parsed = parseSovCsv(csv);
    expect(parsed.items.map((i) => i.description)).toEqual(["Roughing"]);
    expect(parsed.contractSum).toBe(1000);
  });
});

describe("fmtUsd", () => {
  it("always shows cents so paid-so-far and amount due stay exact", () => {
    expect(fmtUsd(108278.1)).toBe("$108,278.10");
    expect(fmtUsd(1467621.9)).toBe("$1,467,621.90");
    expect(fmtUsd(100)).toBe("$100.00");
  });
});

describe("requisitionCalc", () => {
  it("computes earned amount from completion %", () => {
    expect(itemEarned({ value: 10000, completedPct: 50 })).toBe(5000);
  });

  it("supports fractional SOV % so dollars land on the cent", () => {
    // 92.92% of $1,579,692.00-ish line → cents preserved via roundMoney
    expect(itemEarned({ value: 100000, completedPct: 33.33 })).toBe(33330);
    expect(itemEarned({ value: 459000, completedPct: 100 })).toBe(459000);
  });

  it("seeds Baez SOV from Drive import (first line $459,000)", () => {
    const project = seedBaezProject();
    expect(project.items[0].description).toBe("Electric Service Equipment");
    expect(project.items[0].value).toBe(459000);
    expect(project.contractSum).toBe(1700000);
    // Only Electric Service Equipment is retainage-exempt; COs off progress apps.
    expect(project.items[0].retainageExempt).toBe(true);
    expect(project.items[1].retainageExempt).toBeFalsy();
    expect(project.changeOrders).toBe(0);
  });

  it("Baez 100% closeout: item-1 0% retainage → $124,100 held, ELR $1,575,900", () => {
    const project = seedBaezProject();
    project.items = project.items.map((it) => ({ ...it, completedPct: 100 }));
    const g702 = buildG702(project, { changeOrders: 0 });
    expect(g702.totalCompleted).toBe(1700000);
    expect(g702.totalRetainage).toBe(124100);
    expect(g702.earnedLessRetainage).toBe(1575900);
    expect(g702.g703[0].retainagePct).toBe(0);
    expect(g702.g703[0].retainage).toBe(0);
    expect(g702.g703[1].retainagePct).toBe(10);
    // line retainage sums match application total
    const lineSum = g702.g703.reduce((s, r) => s + r.retainage, 0);
    expect(lineSum).toBe(124100);
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

  it("detects change-order SOV lines (CO1 / CO - 01 / Change Order 2)", () => {
    expect(isChangeOrderItem({ description: "CO - 01" })).toBe(true);
    expect(isChangeOrderItem({ description: "CO1" })).toBe(true);
    expect(isChangeOrderItem({ description: "CO2" })).toBe(true);
    expect(isChangeOrderItem({ description: "CO 12" })).toBe(true);
    expect(isChangeOrderItem({ description: "Change Order 3" })).toBe(true);
    expect(isChangeOrderItem({ description: "Roughing" })).toBe(false);
    expect(isChangeOrderItem({ description: "Lighting Controls" })).toBe(false);
  });

  it("seeded Baez SOV has no CO lines and is $1.7M base only", () => {
    const project = seedBaezProject();
    expect(project.items.every((it) => !isChangeOrderItem(it))).toBe(true);
    expect(project.changeOrderList).toEqual([]);
    expect(project.contractSum).toBe(1700000);
    expect(project.items.length).toBe(81);
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

  it("rolls aggregate change orders into total completed and balance", () => {
    const project = {
      contractSum: 1000,
      changeOrders: 200,
      retainagePct: 10,
      items: [{ id: "a", description: "Roughing", value: 1000, completedPct: 100 }],
      requisitions: [],
    };
    const g702 = buildG702(project, { changeOrders: 200, changeOrdersCompleted: 50 });
    expect(g702.contractSumToDate).toBe(1200); // line 3 = 1 +/- 2
    expect(g702.netChangeOrders).toBe(200);
    expect(g702.totalCompleted).toBe(1050); // base 1000 + 50 of COs
    expect(g702.earnedLessRetainage).toBe(945); // 1050 * 0.9
    expect(g702.balanceToFinish).toBe(255); // 1200 - 945
    // G703 gains a change-order aggregate row
    expect(g702.g703[g702.g703.length - 1].description).toMatch(/Change Orders/i);
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

  it("setAllRequisitionItemsComplete sets base lines to 100% and skips CO lines", () => {
    const draft = {
      items: [
        { id: "a", description: "Roughing", completedPct: 50 },
        { id: "b", description: "CO - 01", completedPct: 0 },
      ],
    };
    const next = setAllRequisitionItemsComplete(draft);
    expect(next.items[0].completedPct).toBe(100);
    expect(next.items[1].completedPct).toBe(0);
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
    const draft = {
      ...project,
      changeOrders: 0,
      items: project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 50 })),
    };
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

  it("reconcile pins an authoritative certificate and cascades previously-paid", () => {
    const project = {
      contractSum: 1700000,
      changeOrders: 124100,
      retainagePct: 10,
      items: [{ id: "base", description: "Electrical", value: 1700000, completedPct: 100 }],
      requisitions: [
        {
          num: 11,
          status: "submitted",
          itemsSnapshot: [{ id: "base", key: "|electrical", completedPct: 92.9230588 }], // ~1,579,692 base earned
          g702: { authoritative: true, earnedLessRetainage: 1467621.9 },
        },
        {
          num: 12,
          status: "submitted",
          itemsSnapshot: [{ id: "base", key: "|electrical", completedPct: 100 }],
          g702: {
            authoritative: true,
            totalCompleted: 1751000,
            earnedLessRetainage: 1575900,
            previousCertificates: 1467621.9,
            currentPaymentDue: 108278.1,
          },
        },
      ],
    };
    const rec = reconcileRequisitionFinancials(project);
    const r12 = rec.requisitions.find((r) => r.num === 12);
    expect(r12.earnedLessRetainage).toBe(1575900);
    expect(r12.previousCertificates).toBe(1467621.9);
    expect(r12.currentPaymentDue).toBe(108278.1);
    expect(r12.contractSumToDate).toBe(1824100);
    expect(r12.balanceToFinish).toBe(248200);
    // 6 = 7 + 8 exactly
    expect(r12.previousCertificates + r12.currentPaymentDue).toBeCloseTo(r12.earnedLessRetainage, 2);
    // previously-paid = prior period's cumulative (sum of prior draws)
    expect(rec.requisitions.find((r) => r.num === 11).earnedLessRetainage).toBe(1467621.9);
    expect(rec.changeOrdersCompletedToDate).toBe(51000);
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
    const req = {
      applicationNumber: "REQ-12",
      currentPaymentDue: 108278.1,
      previousCertificates: 1467621.9,
      totalCompleted: 1600000,
      periodTo: "2026-07-01",
    };
    const email = buildRequisitionEmail({
      project,
      requisition: req,
      contact: { email: "gc@test.com" },
      attachments: [{ name: "invoice.pdf" }],
    });
    expect(email.subject).toContain("REQ-12");
    // Money shows to the cent (paid-so-far / due must not round to whole dollars).
    expect(email.body).toContain("108,278.10");
    expect(email.body).toContain("1,467,621.90");
    expect(email.body).toContain("invoice.pdf");
    expect(email.to).toBe("gc@test.com");
    expect(email.signature).toContain("Office@LeElectrical.us");
  });
});

describe("updateRequisitionPercentages", () => {
  it("saves local % edits and rebuilds due amount", () => {
    const project = seedBaezProject();
    const items = project.items.slice(0, 3).map((it, i) => ({
      ...it,
      completedPct: i === 0 ? 50 : 0,
    }));
    const draft = { ...project, items };
    const req = createRequisitionRecord(project, draft, { num: 1, applicationNumber: "REQ-1" });
    const withReq = { ...project, items, requisitions: [req] };
    const pctById = Object.fromEntries(items.map((it) => [it.id, 100]));
    const next = updateRequisitionPercentages(withReq, req.id, pctById);
    const saved = next.requisitions.find((r) => r.id === req.id);
    expect(saved.itemsSnapshot.every((s) => Number(s.completedPct) === 100)).toBe(true);
    expect(saved.totalCompleted).toBeGreaterThan(req.totalCompleted);
    expect(next.items.slice(0, 3).every((it) => Number(it.completedPct) === 100)).toBe(true);
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

  it("uses editable company name and billing block, not VIA engineer", async () => {
    const project = { ...seedBaezProject(), companyName: "BLZ Electric" };
    const req = createRequisitionRecord(project, {
      ...project,
      items: project.items.slice(0, 2).map((it) => ({ ...it, completedPct: 10 })),
    }, { companyName: "BLZ Electric" });
    expect(req.companyName).toBe("BLZ Electric");
    const blob = buildRequisitionPdf(project, req);
    const text = await blob.text();
    expect(text).toContain("BLZ Electric");
    expect(text).toContain("383 Kingston Avenue");
    expect(text).toContain("Suite 297");
    expect(text).toContain("718-594-1850");
    expect(text).toContain("LE@LEelectrical.US");
    expect(text).not.toContain("VIA (Engineer)");
    expect(text).not.toContain("Martin Dorkin");
  });
});