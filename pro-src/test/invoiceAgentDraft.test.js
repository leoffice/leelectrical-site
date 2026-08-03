import { describe, expect, it } from "vitest";
import {
  approveAgentDraftPatch,
  buildAgentDraftPatch,
  buildDocChangeSummary,
  collectPendingDocReviews,
  computeLearningDelta,
  denyAgentDraftPatch,
  hasPendingDocReview,
  hasPendingEstimateReview,
  hasPendingInvoiceReview,
  proposeRemoteDocChange,
} from "../src/lib/invoiceAgentDraft.js";

const JOB = {
  id: "J-1",
  customer: "Goodness and kindness",
  personName: "Sholom Rubashkin",
  address: "1337 President St, Brooklyn, NY 11213",
  serviceAddress: "1337 President St, Brooklyn, NY 11213",
  phone: "917-755-2477",
  email: "Goodnessandkindnessinc@gmail.com",
  invoiceNo: "251841",
  amount: "$550",
  invoiceLines: [
    { itemName: "Labor", description: "Work", qty: 1, unitPrice: 400 },
    { itemName: "Permit fee", description: "DOB", qty: 1, unitPrice: 150 },
  ],
};

describe("buildAgentDraftPatch", () => {
  it("applies change labor to $450 as pending draft WITHOUT changing live amount", () => {
    const intent = { actions: [{ type: "set_amount", match: "labor", amount: 450 }], summary: "set labor to $450" };
    const patch = buildAgentDraftPatch(JOB, intent, "change labor to $450");
    expect(patch.invoiceAgentDraft.pendingReview).toBe(true);
    expect(patch.invoiceAgentDraft.lines[0].unitPrice).toBe(450);
    expect(patch.invoiceAgentDraft.baselineAmount).toBe(550);
    expect(patch.invoiceAgentDraft.proposedAmount).toBe(600);
    // Guardrail: live amount must stay until Levi approves
    expect(patch.amount).toBeUndefined();
    expect(patch.invoiceLines).toBeUndefined();
    expect(hasPendingInvoiceReview({ ...JOB, ...patch })).toBe(true);
  });

  it("removes permit fee line in draft only", () => {
    const intent = { actions: [{ type: "remove_line", match: "permit fee" }], summary: "remove permit fee" };
    const patch = buildAgentDraftPatch(JOB, intent, "remove permit fee");
    expect(patch.invoiceAgentDraft.lines).toHaveLength(1);
    expect(patch.invoiceAgentDraft.proposedAmount).toBe(400);
    expect(patch.amount).toBeUndefined();
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
    expect(patch.amount).toBe("$625");
    const delta = computeLearningDelta(draftJob.invoiceAgentDraft.lines, approved, "change labor to $450");
    expect(delta.some((d) => d.field === "unitPrice" && d.approved === 475)).toBe(true);
  });
});

describe("denyAgentDraftPatch", () => {
  it("clears pending review without touching live lines/amount", () => {
    const draftJob = {
      ...JOB,
      invoiceAgentDraft: {
        pendingReview: true,
        baselineLines: JOB.invoiceLines,
        lines: [{ itemName: "Labor", qty: 1, unitPrice: 0 }],
        proposedAmount: 0,
      },
    };
    const patch = denyAgentDraftPatch(draftJob);
    expect(patch.invoiceAgentDraft.pendingReview).toBe(false);
    expect(patch.invoiceAgentDraft.deniedAt).toBeTruthy();
    expect(patch.invoiceLines).toBeUndefined();
    expect(patch.amount).toBeUndefined();
  });
});

describe("proposeRemoteDocChange", () => {
  it("stages remote amount rewrite as pending, not live", () => {
    const patch = proposeRemoteDocChange(JOB, {
      kind: "invoice",
      amount: 0,
      agent: "israel",
      sourceText: "restored placeholder",
    });
    expect(patch.invoiceAgentDraft.pendingReview).toBe(true);
    expect(patch.invoiceAgentDraft.proposedAmount).toBe(0);
    expect(patch.invoiceAgentDraft.baselineAmount).toBe(550);
    expect(patch.amount).toBeUndefined();
    expect(patch.invoiceLines).toBeUndefined();
  });

  it("supports estimate remote drafts", () => {
    const estJob = {
      id: "E-1",
      customer: "Goodness and kindness",
      estimateNo: "201963",
      amount: "$12,000",
      estimateLines: [{ itemName: "Installation", description: "New service", qty: 1, unitPrice: 12000 }],
    };
    const patch = proposeRemoteDocChange(estJob, {
      kind: "estimate",
      lines: [{ itemName: "Installation", description: "placeholder", qty: 1, unitPrice: 0 }],
      agent: "israel",
      sourceText: "restored after missing",
    });
    expect(patch.estimateAgentDraft.pendingReview).toBe(true);
    expect(patch.estimateAgentDraft.proposedAmount).toBe(0);
    expect(hasPendingEstimateReview({ ...estJob, ...patch })).toBe(true);
    expect(hasPendingDocReview({ ...estJob, ...patch })).toBe(true);
  });
});

describe("buildDocChangeSummary + collectPendingDocReviews", () => {
  it("builds condensed card fields and flags dangerous zero", () => {
    const draftJob = {
      ...JOB,
      invoiceAgentDraft: {
        pendingReview: true,
        baselineLines: JOB.invoiceLines,
        lines: [{ itemName: "Installation", description: "placeholder", qty: 1, unitPrice: 0 }],
        baselineAmount: 550,
        proposedAmount: 0,
        sourceText: "restored after missing",
        agent: "israel",
      },
    };
    const s = buildDocChangeSummary(draftJob, draftJob.invoiceAgentDraft, "invoice");
    expect(s.customer).toMatch(/Goodness/i);
    expect(s.address).toMatch(/1337 President/i);
    expect(s.beforeFmt).toBe("$550");
    expect(s.afterFmt).toBe("$0");
    expect(s.dangerous).toBe(true);
    const list = collectPendingDocReviews([draftJob]);
    expect(list).toHaveLength(1);
    expect(list[0].key).toMatch(/^doc-change:invoice:/);
  });
});
