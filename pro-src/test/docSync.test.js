import { describe, expect, it } from "vitest";
import {
  docSyncFailedForJob,
  docSyncFailurePatch,
  docSyncPendingForJob,
  findJobsLinkedToEstimate,
  normalizeDocLines,
  planDocSaveLocal,
  planDocSaveSync,
  planInvoicePatchFromEstimateUpdate,
  planLinkedInvoicePatchesFromEstimate,
} from "../src/lib/docSync.js";
import { parseAmount } from "../src/lib/format.js";

const job = {
  id: "J-SYNC",
  customer: "Acme LLC",
  email: "a@acme.com",
  estimateNo: "E-100",
  invoiceNo: "251900",
  serviceAddress: "10 Broadway",
  apartment: "2A",
  estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 500, description: "Work" }],
  invoiceLines: [{ itemName: "Labor", qty: 1, unitPrice: 500, description: "Work" }],
};

describe("docSync", () => {
  it("docSyncFailedForJob detects failed create when job has no doc number", () => {
    const bare = { id: "J-SYNC", customer: "Acme LLC" };
    expect(
      docSyncFailedForJob(
        [{ jobId: "J-SYNC", type: "create_estimate", status: "failed", error: "no_customer" }],
        "J-SYNC",
        "estimate",
        bare
      )
    ).toBe(true);
    expect(docSyncFailedForJob([], "J-SYNC", "estimate", job)).toBe(false);
    expect(docSyncFailedForJob(
      [{ jobId: "J-SYNC", type: "create_estimate", status: "failed" }],
      "J-SYNC",
      "estimate",
      job
    )).toBe(false);
  });

  it("docSyncPendingForJob detects queued update commands", () => {
    expect(
      docSyncPendingForJob(
        [
          { jobId: "J-SYNC", type: "update_invoice", status: "queued" },
          { jobId: "J-2", type: "update_estimate", status: "queued" },
        ],
        "J-SYNC"
      )
    ).toBe(true);
    expect(
      docSyncPendingForJob([{ jobId: "J-SYNC", type: "update_invoice", status: "done" }], "J-SYNC")
    ).toBe(false);
  });

  it("planDocSaveLocal saves job patch without QuickBooks commands", () => {
    const lines = [{ itemName: "Labor", qty: 1, unitPrice: 600, description: "Work" }];
    const plan = planDocSaveLocal(job, {
      kind: "estimate",
      mode: "create",
      lines,
      serviceAddress: "12 Pine St",
      apartment: "4B",
    });
    expect(plan.commands).toBeUndefined();
    expect(plan.jobPatch.serviceAddress).toBe("12 Pine St");
    expect(plan.jobPatch.estimateLines[0].unitPrice).toBe(600);
    expect(plan.jobPatch.status.Estimate.s).toBe("done");
  });

  it("docSyncFailurePatch clears pipeline step on failed sync", () => {
    expect(docSyncFailurePatch("create_estimate")).toEqual({ status: { Estimate: { s: "", d: "" } } });
    expect(docSyncFailurePatch("create_invoice")).toEqual({ status: { Invoiced: { s: "", d: "" } } });
  });

  it("planDocSaveSync does not mark pipeline done until QuickBooks confirms", () => {
    const lines = [{ itemName: "Labor", qty: 1, unitPrice: 600, description: "Work" }];
    const plan = planDocSaveSync(job, {
      kind: "estimate",
      mode: "create",
      lines,
      serviceAddress: "12 Pine St",
      apartment: "4B",
      send: false,
    });
    expect(plan.jobPatch.status).toBeUndefined();
    expect(plan.jobPatch.estimateLines[0].unitPrice).toBe(600);
    expect(plan.commands[0].type).toBe("create_estimate");
  });

  it("planDocSaveSync on invoice edit enqueues linked estimate address update", () => {
    const lines = [{ itemName: "Labor", qty: 1, unitPrice: 550, description: "Work" }];
    const plan = planDocSaveSync(job, {
      kind: "invoice",
      mode: "edit",
      lines,
      serviceAddress: "99 Oak Ave",
      apartment: "3C",
      send: false,
    });
    expect(plan.jobPatch.serviceAddress).toBe("99 Oak Ave");
    expect(plan.jobPatch.invoiceLines[0].unitPrice).toBe(550);
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0].type).toBe("update_invoice");
    expect(plan.commands[0].payload.invoiceNo).toBe("251900");
    expect(plan.commands[0].payload.serviceAddress).toBe("99 Oak Ave");
    expect(plan.commands[1].type).toBe("update_estimate");
    expect(plan.commands[1].payload.estimateNo).toBe("E-100");
    expect(plan.commands[1].payload.serviceAddress).toBe("99 Oak Ave");
    expect(plan.commands[1].payload.shipAddr).toEqual({ Line1: "99 Oak Ave", Line2: "3C" });
  });

  it("planDocSaveSync upgrades create to update when invoice already exists", () => {
    const lines = [{ itemName: "Labor", qty: 1, unitPrice: 550, description: "Work" }];
    const plan = planDocSaveSync(job, {
      kind: "invoice",
      mode: "create",
      lines,
      serviceAddress: "10 Broadway",
      apartment: "2A",
      send: false,
    });
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0].type).toBe("update_invoice");
    expect(plan.commands[0].payload.invoiceNo).toBe("251900");
  });

  it("planDocSaveLocal heals corrupt paid stamp when re-saving same invoice total", () => {
    // Amount already $34,700 on the job; save must still fix openBalance / paid.
    const seewald = {
      id: "qbo-231595",
      customer: "Shneor Seewald",
      invoiceNo: "231595",
      amount: "$34,700",
      paid: true,
      openBalance: 0,
      paymentBaseline: 14585.1,
      amountWhenBaselined: 34700,
      invoiceProgressBilling: true,
      serviceAddress: "1445 President St",
      apartment: "",
      payments: [
        { id: "p1", amount: "5000", method: "Zelle", date: "2026-07-24" },
        { id: "p2", amount: "5000", method: "Zelle", date: "2026-07-18" },
        { id: "p3", amount: "5000", method: "Zelle", date: "2026-07-06" },
      ],
      invoiceLines: [
        { itemName: "Installation", qty: 0.8, unitPrice: 40000, description: "Wiring" },
        { itemName: "Tesla Charger", qty: 1, unitPrice: 2700, description: "Permit" },
      ],
    };
    const plan = planDocSaveLocal(seewald, {
      kind: "invoice",
      mode: "edit",
      lines: seewald.invoiceLines,
      serviceAddress: seewald.serviceAddress,
      apartment: "",
    });
    expect(plan.jobPatch.amount).toMatch(/34,?700/);
    expect(plan.jobPatch.openBalance).toBe(19700);
    expect(plan.jobPatch.paid).toBe(false);
    expect(plan.jobPatch.paymentBaseline).toBe(34700);
  });

  it("planDocSaveSync on estimate edit enqueues linked invoice address update", () => {
    const plan = planDocSaveSync(job, {
      kind: "estimate",
      mode: "edit",
      lines: job.estimateLines,
      serviceAddress: "200 Park Ave",
      apartment: "",
      send: false,
    });
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0].type).toBe("update_estimate");
    expect(plan.commands[1].type).toBe("update_invoice");
    expect(plan.commands[1].payload.invoiceNo).toBe("251900");
    expect(plan.commands[1].payload.serviceAddress).toBe("200 Park Ave");
  });

  it("normalizeDocLines stores unitPrice as numbers (typed rate sticks)", () => {
    const rows = normalizeDocLines([{ itemName: "Labor", qty: "1", unitPrice: "9200", description: "Work" }]);
    expect(rows[0].unitPrice).toBe(9200);
    expect(rows[0].rate).toBe(9200);
    expect(rows[0].amount).toBe(9200);
  });

  it("planInvoicePatchFromEstimateUpdate keeps progress % when contract doubles", () => {
    // Goodness & Kindness: est $4,600 → $9,200, invoice was 50% progress.
    const inv = {
      id: "local-inv",
      invoiceNo: "251854",
      estimateNo: "201963",
      amount: "$2,300",
      openBalance: 0,
      paid: true,
      paymentBaseline: 2300,
      invoiceProgressBilling: true,
      invoiceProgressPct: 50,
      payments: [{ id: "p1", amount: "2300", method: "Credit card", date: "2026-08-05" }],
      estimateLines: [{ itemName: "Service Upgrade:1 Meter", qty: 1, unitPrice: 4600 }],
      invoiceLines: [
        {
          itemName: "Service Upgrade:1 Meter",
          qty: 0.5,
          unitPrice: 4600,
          progressBilling: true,
          contractQty: 1,
        },
      ],
    };
    const patch = planInvoicePatchFromEstimateUpdate(inv, [
      { itemName: "Service Upgrade:1 Meter", qty: 1, unitPrice: 9200, description: "Upgraded scope" },
    ]);
    expect(patch).toBeTruthy();
    expect(parseAmount(patch.amount)).toBe(4600);
    expect(patch.invoiceProgressPct).toBe(50);
    expect(patch.contractAmount).toBe(9200);
    expect(patch.estimateLines[0].unitPrice).toBe(9200);
    expect(patch.invoiceLines[0].unitPrice).toBe(9200);
    expect(patch.invoiceLines[0].qty).toBeCloseTo(0.5, 5);
    // Paid $2,300 on a $4,600 draw → still owes $2,300
    expect(patch.openBalance).toBe(2300);
    expect(patch.paid).toBe(false);
  });

  it("findJobsLinkedToEstimate matches sibling by estimateNo (split est/inv jobs)", () => {
    const est = {
      id: "qbo-est-201963",
      estimateNo: "201963",
      amount: "$4,600",
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 4600 }],
    };
    const inv = {
      id: "local-1785688750694",
      estimateNo: "201963",
      invoiceNo: "251854",
      amount: "$2,300",
      invoiceProgressBilling: true,
      invoiceProgressPct: 50,
      invoiceLines: [{ itemName: "Labor", qty: 0.5, unitPrice: 4600, progressBilling: true }],
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 4600 }],
    };
    const hits = findJobsLinkedToEstimate([est, inv], est);
    expect(hits.map((j) => j.id)).toEqual(["local-1785688750694"]);
    const plans = planLinkedInvoicePatchesFromEstimate(
      est,
      [{ itemName: "Labor", qty: 1, unitPrice: 9200 }],
      [est, inv]
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].jobId).toBe("local-1785688750694");
    expect(parseAmount(plans[0].patch.amount)).toBe(4600);
  });

  it("planDocSaveLocal on estimate with invoice on same job re-applies progress %", () => {
    const same = {
      id: "J-BOTH",
      estimateNo: "E-1",
      invoiceNo: "I-1",
      amount: "$2,300",
      invoiceProgressBilling: true,
      invoiceProgressPct: 50,
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 4600 }],
      invoiceLines: [{ itemName: "Labor", qty: 0.5, unitPrice: 4600, progressBilling: true, contractQty: 1 }],
      payments: [{ id: "p1", amount: "2300", method: "Card", date: "2026-08-05" }],
      serviceAddress: "1337 President St",
    };
    const plan = planDocSaveLocal(same, {
      kind: "estimate",
      mode: "edit",
      lines: [{ itemName: "Labor", qty: 1, unitPrice: 9200, description: "Expanded" }],
      serviceAddress: "1337 President St",
      apartment: "",
    });
    expect(plan.jobPatch.estimateLines[0].unitPrice).toBe(9200);
    expect(plan.jobPatch.invoiceLines[0].unitPrice).toBe(9200);
    // Dual job A/R face stays invoice due (50% of $9,200); contract is on estimateLines.
    expect(parseAmount(plan.jobPatch.amount)).toBe(4600);
    expect(plan.jobPatch.contractAmount).toBe(9200);
    expect(plan.jobPatch.invoiceProgressPct).toBe(50);
  });

  it("planDocSaveLocal on pure estimate keeps full contract amount (no invoice wipe)", () => {
    const estOnly = {
      id: "qbo-est-201963",
      estimateNo: "201963",
      amount: "$4,600",
      estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 4600 }],
      serviceAddress: "1337 President St",
    };
    const plan = planDocSaveLocal(estOnly, {
      kind: "estimate",
      mode: "edit",
      lines: [{ itemName: "Labor", qty: 1, unitPrice: 9200, description: "Expanded scope" }],
      serviceAddress: "1337 President St",
      apartment: "",
    });
    expect(plan.jobPatch.estimateLines[0].unitPrice).toBe(9200);
    expect(parseAmount(plan.jobPatch.amount)).toBe(9200);
    expect(plan.jobPatch.contractAmount).toBe(9200);
    expect(plan.jobPatch.invoiceLines).toBeUndefined();
  });
});