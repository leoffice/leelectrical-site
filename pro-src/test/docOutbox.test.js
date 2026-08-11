// @vitest-environment jsdom
// Levi 2026-08-11: an invoice must be durable the instant it is created, but
// creating it must stay snappy — so the record is written locally first and
// the cloud save confirms in the background. Anything unconfirmed is replayed.
import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmDocSave,
  flushDocOutbox,
  markDocSaveAttempt,
  pendingDocSaveCount,
  pendingDocSaves,
  rememberDocSave,
} from "../src/lib/docOutbox.js";

const JOB = "local-1785273815640";
const patch = { invoiceNo: "LE-2712", amount: 500, invoiceLines: [{ qty: 1, unitPrice: 500 }] };

beforeEach(() => localStorage.clear());

describe("doc outbox", () => {
  it("records a doc patch synchronously and survives a reload", () => {
    rememberDocSave(JOB, patch);
    expect(pendingDocSaveCount()).toBe(1);
    // A fresh read (as after a reload) still sees it.
    const [entry] = pendingDocSaves();
    expect(entry.jobId).toBe(JOB);
    expect(entry.patch.invoiceNo).toBe("LE-2712");
    expect(entry.docNo).toBe("LE-2712");
  });

  it("ignores patches that carry no document", () => {
    rememberDocSave(JOB, { notes: "just a note" });
    expect(pendingDocSaveCount()).toBe(0);
  });

  it("clears once the network save confirms", () => {
    rememberDocSave(JOB, patch);
    confirmDocSave(JOB);
    expect(pendingDocSaveCount()).toBe(0);
  });

  it("keeps the record when the save fails, and replays it later", async () => {
    rememberDocSave(JOB, patch);
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error("offline");
    };
    const first = await flushDocOutbox(failing);
    expect(first).toEqual({ replayed: 0, failed: 1 });
    expect(pendingDocSaveCount()).toBe(1); // NOT lost
    expect(pendingDocSaves()[0].attempts).toBe(1);

    const saved = [];
    const ok = async (jobId, p) => saved.push([jobId, p]);
    const second = await flushDocOutbox(ok);
    expect(second).toEqual({ replayed: 1, failed: 0 });
    expect(saved[0][0]).toBe(JOB);
    expect(saved[0][1].invoiceNo).toBe("LE-2712");
    expect(pendingDocSaveCount()).toBe(0);
    expect(calls).toBe(1);
  });

  it("tracks repeated failures without dropping the record", () => {
    rememberDocSave(JOB, patch);
    for (let i = 0; i < 5; i++) markDocSaveAttempt(JOB, "boom");
    expect(pendingDocSaves()[0].attempts).toBe(5);
    expect(pendingDocSaveCount()).toBe(1);
  });

  it("a flush with nothing pending is a no-op", async () => {
    expect(await flushDocOutbox(async () => {})).toEqual({ replayed: 0, failed: 0 });
  });
});
