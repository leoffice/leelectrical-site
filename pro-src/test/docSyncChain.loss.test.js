// DATA LOSS REGRESSION — Mordechai Nemni, 2026-08-10.
//
// @vitest-environment jsdom
//
// An invoice built for a customer who did not yet exist in QuickBooks is
// stashed locally and flushed once create_customer lands. The old flow called
// takePendingDocSync() BEFORE knowing whether the flush queued anything, so a
// flush that returned false (or threw into a swallowed .catch) destroyed the
// invoice the user had already been told was on its way. Nothing remained on
// the job, in the command queue, or in QuickBooks.
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingDocSync,
  hasPendingDocSync,
  markPendingDocSyncFailure,
  peekPendingDocSync,
  pendingDocSyncJobIds,
  stashPendingDocSync,
  takePendingDocSync,
  flushPendingDocSync,
} from "../src/lib/docSyncChain.js";

const JOB = "local-1786391511837"; // the real Nemni job id
const bundle = () => ({
  kind: "invoice",
  send: true,
  email: "nemnifam@gmail.com",
  commands: [
    { type: "send_invoice", idk: "send:inv:1", payload: { invoiceNo: "", amount: "500" } },
  ],
  attachments: [],
});

beforeEach(() => {
  localStorage.clear();
});

describe("pending doc sync survives a failed flush", () => {
  it("peek does NOT consume the bundle (take does — that was the bug)", () => {
    stashPendingDocSync(JOB, bundle());
    expect(peekPendingDocSync(JOB)).toBeTruthy();
    expect(peekPendingDocSync(JOB)).toBeTruthy(); // still there
    expect(hasPendingDocSync(JOB)).toBe(true);

    expect(takePendingDocSync(JOB)).toBeTruthy();
    expect(peekPendingDocSync(JOB)).toBeNull(); // consumed — the loss window
  });

  it("a flush that cannot queue leaves the invoice recoverable", async () => {
    stashPendingDocSync(JOB, bundle());
    const enqueued = [];
    // No qboCustomerId on the job → flush refuses to queue.
    const queued = await flushPendingDocSync({
      enqueue: async (...a) => enqueued.push(a),
      jobId: JOB,
      job: { id: JOB, qboCustomerId: "" },
      bundle: peekPendingDocSync(JOB),
    });
    expect(queued).toBe(false);
    expect(enqueued).toHaveLength(0);

    // The fixed flow records the failure and KEEPS the bundle.
    markPendingDocSyncFailure(JOB, "no_qbo_customer");
    const kept = peekPendingDocSync(JOB);
    expect(kept).toBeTruthy();
    expect(kept.commands).toHaveLength(1);
    expect(kept.flushAttempts).toBe(1);
    expect(kept.lastFlushError).toMatch(/no_qbo_customer/);
    expect(pendingDocSyncJobIds()).toContain(JOB);
  });

  it("only a successful flush clears the bundle", async () => {
    stashPendingDocSync(JOB, bundle());
    const enqueued = [];
    const queued = await flushPendingDocSync({
      enqueue: async (...a) => enqueued.push(a),
      jobId: JOB,
      job: { id: JOB, qboCustomerId: "1608" }, // the real Nemni QBO id
      bundle: peekPendingDocSync(JOB),
    });
    expect(queued).toBe(true);
    expect(enqueued.length).toBeGreaterThan(0);
    clearPendingDocSync(JOB);
    expect(peekPendingDocSync(JOB)).toBeNull();
    expect(hasPendingDocSync(JOB)).toBe(false);
  });

  it("retrying a kept bundle re-queues with the same idempotency key", async () => {
    stashPendingDocSync(JOB, bundle());
    const keys = [];
    const enqueue = async (type, jobId, payload, lane, idk) => keys.push(idk);
    for (let attempt = 0; attempt < 2; attempt++) {
      await flushPendingDocSync({
        enqueue,
        jobId: JOB,
        job: { id: JOB, qboCustomerId: "1608" },
        bundle: peekPendingDocSync(JOB),
      });
    }
    // Same key both times — a retry cannot double-send.
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("clearing a job that has nothing stashed is harmless", () => {
    expect(() => clearPendingDocSync("nope")).not.toThrow();
    expect(() => markPendingDocSyncFailure("nope", "x")).not.toThrow();
  });
});
