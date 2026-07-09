import { describe, expect, it } from "vitest";
import {
  approveAgentDraftPatch,
  buildAgentDraftPatch,
  computeLearningDelta,
  hasPendingInvoiceReview,
} from "../src/lib/invoiceAgentDraft.js";

const JOB = {
  id: "J-1",
  invoiceNo: "251841",
  amount: "$550",
  invoiceLines: [
    { itemName: "Labor", description: "Work", qty: 1, unitPrice: 400 },
    { itemName: "Permit fee", description: "DOB", qty: 1, unitPrice: 150 },
  ],
};

describe("buildAgentDraftPatch", () => {
  it("applies change labor to $450 as pending draft", () => {
    const intent = { actions: [{ type: "set_amount", match: "labor", amount: 450 }], summary: "set labor to $450" };
    const patch = buildAgentDraftPatch(JOB, intent, "change labor to $450");
    expect(patch.invoiceAgentDraft.pendingReview).toBe(true);
    expect(patch.invoiceAgentDraft.lines[0].unitPrice).toBe(450);
    expect(patch.amount).toBe("$600");
    expect(hasPendingInvoiceReview({ ...JOB, ...patch })).toBe(true);
  });

  it("removes permit fee line", () => {
    const intent = { actions: [{ type: "remove_line", match: "permit fee" }], summary: "remove permit fee" };
    const patch = buildAgentDraftPatch(JOB, intent, "remove permit fee");
    expect(patch.invoiceAgentDraft.lines).toHaveLength(1);
    expect(patch.amount).toBe("$400");
  });
});

describe("approveAgentDraftPatch + learning", () => {
  it("records delta when Levi corrects agent amount on approve", () => {
    const draftJob = {
      ...JOB,
      invoiceAgentDraft: {
        pendingReview: true,
        sourceText: "change labor to $450",
        lines: [
          { itemName: "Labor", qty: 1, unitPrice: 450 },
          { itemName: "Permit fee", qty: 1, unitPrice: 150 },
        ],
      },
    };
    const approved = [
      { itemName: "Labor", qty: 1, unitPrice: 475 },
      { itemName: "Permit fee", qty: 1, unitPrice: 150 },
    ];
    const patch = approveAgentDraftPatch(draftJob, approved);
    expect(patch.invoiceAgentDraft.pendingReview).toBe(false);
    expect(patch.invoiceLines[0].unitPrice).toBe(475);
    const delta = computeLearningDelta(draftJob.invoiceAgentDraft.lines, approved, "change labor to $450");
    expect(delta.some((d) => d.field === "unitPrice" && d.approved === 475)).toBe(true);
  });
});