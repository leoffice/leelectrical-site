import { describe, expect, it } from "vitest";
import {
  docSyncFailedForJob,
  docSyncFailurePatch,
  docSyncPendingForJob,
  planDocSaveLocal,
  planDocSaveSync,
} from "../src/lib/docSync.js";

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
});