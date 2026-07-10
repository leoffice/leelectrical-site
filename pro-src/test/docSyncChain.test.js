// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingDocSync,
  hasPendingDocSync,
  stashPendingDocSync,
  takePendingDocSync,
} from "../src/lib/docSyncChain.js";

const KEY = "le-pro-pending-doc-sync";

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe("docSyncChain", () => {
  it("stashes and takes pending doc sync for a job", () => {
    const bundle = {
      commands: [{ type: "create_estimate", payload: { customer: "Acme" }, idk: "k1" }],
      attachments: [],
      send: false,
      kind: "estimate",
    };
    stashPendingDocSync("J-1", bundle);
    expect(hasPendingDocSync("J-1")).toBe(true);
    const taken = takePendingDocSync("J-1");
    expect(taken.commands).toEqual(bundle.commands);
    expect(taken.kind).toBe("estimate");
    expect(hasPendingDocSync("J-1")).toBe(false);
  });

  it("flushPendingDocSync queues doc commands with qboCustomerId", async () => {
    const enqueue = vi.fn().mockResolvedValue({});
    const bundle = {
      commands: [{ type: "create_estimate", payload: { customer: "Acme" }, idk: "k1" }],
      attachments: [],
      send: false,
      kind: "estimate",
    };
    const ok = await flushPendingDocSync({
      enqueue,
      jobId: "J-2",
      job: { qboCustomerId: "1601", customer: "Acme" },
      bundle,
    });
    expect(ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      "create_estimate",
      "J-2",
      { customer: "Acme", qboCustomerId: "1601" },
      "judgment",
      "k1"
    );
  });

  it("flushPendingDocSync skips when customer is not linked", async () => {
    const enqueue = vi.fn();
    const ok = await flushPendingDocSync({
      enqueue,
      jobId: "J-3",
      job: { customer: "Acme" },
      bundle: { commands: [], attachments: [], send: false, kind: "estimate" },
    });
    expect(ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});