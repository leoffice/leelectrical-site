// @vitest-environment jsdom
// Levi 2026-07-28: Convert to Invoice collapsed to one generic line, and there
// was no way to delete a drafted or an issued invoice.
import { describe, expect, it } from "vitest";
import { initialLines } from "../src/lib/qboDoc.js";
import { isFromEstimateMode } from "../src/lib/progressBilling.js";
import {
  isDocDraft,
  jobHasOtherDoc,
  removeDocCopy,
  removeDocPlan,
} from "../src/lib/deleteDoc.js";

const ESTIMATE_LINES = [
  { itemName: "Panel upgrade", description: "200A service", qty: 1, unitPrice: 4200 },
  { itemName: "Permit filing", description: "DOB electrical", qty: 1, unitPrice: 850 },
  { itemName: "Rough-in", description: "12 outlets", qty: 12, unitPrice: 95 },
];

describe("Convert to invoice", () => {
  const job = { id: "J-1", customer: "Lincoln Owner", estimateNo: "25484", estimateLines: ESTIMATE_LINES };

  it("both spellings of the from-estimate mode mean the same thing", () => {
    expect(isFromEstimateMode("from_estimate")).toBe(true);
    expect(isFromEstimateMode("turn_from_estimate")).toBe(true);
    expect(isFromEstimateMode("edit")).toBe(false);
    expect(isFromEstimateMode("create")).toBe(false);
  });

  it("carries every estimate line over, not one lumped line", () => {
    const lines = initialLines(job, { kind: "invoice", mode: "turn_from_estimate", progressPct: 100 });
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.itemName)).toEqual([
      "Panel upgrade",
      "Permit filing",
      "Rough-in",
    ]);
    // The old bug: a single "General electrical work" row off job.amount.
    expect(lines.some((l) => /general electrical work/i.test(l.itemName || ""))).toBe(false);
  });

  it("Convert matches the Create-invoice-from-estimate path exactly", () => {
    const viaConvert = initialLines(job, { kind: "invoice", mode: "turn_from_estimate", progressPct: 100 });
    const viaPicker = initialLines(job, { kind: "invoice", mode: "from_estimate", progressPct: 100 });
    expect(viaConvert).toEqual(viaPicker);
  });

  it("a partial conversion still brings every line, scaled", () => {
    const lines = initialLines(job, { kind: "invoice", mode: "turn_from_estimate", progressPct: 50 });
    expect(lines).toHaveLength(3);
  });

  it("converting a job that already holds invoice lines rebuilds from the estimate", () => {
    const withInvoice = { ...job, invoiceLines: [{ itemName: "Old stub", qty: 1, unitPrice: 100 }] };
    const lines = initialLines(withInvoice, {
      kind: "invoice",
      mode: "turn_from_estimate",
      progressPct: 100,
    });
    expect(lines.map((l) => l.itemName)).toContain("Panel upgrade");
    expect(lines.map((l) => l.itemName)).not.toContain("Old stub");
  });

  it("a job with an amount but no estimate still gets its single fallback line", () => {
    const bare = { id: "J-2", amount: "$500", title: "Outlet swap" };
    const lines = initialLines(bare, { kind: "invoice", mode: "create" });
    expect(lines).toHaveLength(1);
    expect(lines[0].itemName).toBe("General electrical work");
  });
});

describe("deleting a document", () => {
  it("a draft invoice is just dropped — nothing to undo in QuickBooks", () => {
    const job = {
      id: "J-1",
      invoiceLines: [{ itemName: "Panel upgrade", qty: 1, unitPrice: 4200 }],
    };
    expect(isDocDraft(job, "invoice")).toBe(true);
    const plan = removeDocPlan(job, "invoice");
    expect(plan.mode).toBe("draft");
    expect(plan.warnsQuickbooks).toBe(false);
    expect(plan.patch.invoiceLines).toEqual([]);
    expect(plan.patch._deleted).toBeUndefined();
    expect(removeDocCopy(job, "invoice", plan).confirm).toBe("Delete draft invoice");
  });

  it("an issued invoice on its own row takes the row with it, QuickBooks untouched", () => {
    const job = { id: "J-1", invoiceNo: "16664", invoiceLines: ESTIMATE_LINES };
    const plan = removeDocPlan(job, "invoice");
    expect(plan.mode).toBe("row");
    expect(plan.patch).toEqual({ _deleted: true });
    expect(plan.syncedNo).toBe("16664");
    expect(plan.warnsQuickbooks).toBe(true);
    expect(removeDocCopy(job, "invoice", plan).body).toMatch(/QuickBooks is not changed/);
  });

  it("deleting the invoice off a row that also holds the estimate keeps the estimate", () => {
    const job = {
      id: "J-1",
      invoiceNo: "16664",
      invoiceLines: ESTIMATE_LINES,
      estimateNo: "25484",
      estimateLines: ESTIMATE_LINES,
    };
    expect(jobHasOtherDoc(job, "invoice")).toBe(true);
    const plan = removeDocPlan(job, "invoice");
    expect(plan.mode).toBe("fields");
    expect(plan.patch._deleted).toBeUndefined();
    expect(plan.patch.invoiceNo).toBe("");
    expect(plan.patch.estimateNo).toBeUndefined();
    expect(removeDocCopy(job, "invoice", plan).body).toMatch(/other document on this job stays/);
  });

  it("the same rules apply to estimates", () => {
    const draft = { id: "J-1", estimateLines: [{ itemName: "Rough-in", qty: 1, unitPrice: 95 }] };
    expect(removeDocPlan(draft, "estimate").mode).toBe("draft");
    const issued = { id: "J-2", estimateNo: "25484", estimateLines: ESTIMATE_LINES };
    expect(removeDocPlan(issued, "estimate").mode).toBe("row");
  });

  it("an empty line list is not a draft", () => {
    expect(isDocDraft({ id: "J-1", invoiceLines: [{ itemName: "  " }] }, "invoice")).toBe(false);
    expect(isDocDraft({ id: "J-1" }, "invoice")).toBe(false);
  });
});
