import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeIncomingOv, saveJobState, stateWriteBody } from "../../netlify/functions/lib/ovMerge.mjs";
import { createMemoryStore } from "../src/lib/backup.js";
import { mergeJobs, normalizeJob } from "../src/data/merge.js";
import { stageOf } from "../src/lib/stages.js";

const NOW = 1_700_000_000_000;

function storedWith() {
  return {
    "JP-KEEP": { customer: "Keep me", notes: "original", _savedAt: 500, _version: 3 },
    "JP-NEW": { customer: "Newer", notes: "fresh", _savedAt: 900, _version: 4 },
    _sasTickets: { "call-1": { handled: true }, _savedAt: 500, _version: 2 },
    _projects: { list: [{ id: "p1" }], _savedAt: 500, _version: 1 },
    _nomerge: ["alpha|beta"],
    _invoiceEditLearning: [{ field: "unitPrice" }],
    _auditLog: { byId: { a: { id: "a", at: "2026-01-01" } }, schema: 1 },
    _ovStamp: { _nomerge: { _savedAt: 500, _version: 1 } },
  };
}

describe("Cloudflare state write", () => {
  it("the Pages handler merges through ovMerge and does not replace ov", () => {
    const src = readFileSync(new URL("../../netlify/functions/state.mjs", import.meta.url), "utf8");
    expect(src).toContain("mergeIncomingOv");
    expect(src).toContain("stateWriteBody");
    expect(src).not.toMatch(/const ov = body\.ov/);
    expect(src).toContain("rotateJsonBackup");
    expect(src).toContain("capAuditLog");
  });

  it("a POST missing keys keeps them, including special keys and the audit log", () => {
    const body = stateWriteBody("POST", { ov: { "JP-KEEP": { notes: "from stale tab" } } });
    const { ov, skipped } = mergeIncomingOv(storedWith(), body, NOW);
    expect(skipped).toEqual([]);
    expect(ov["JP-KEEP"].notes).toBe("from stale tab");
    expect(ov["JP-KEEP"].customer).toBe("Keep me");
    expect(ov["JP-NEW"].notes).toBe("fresh");
    expect(ov._sasTickets["call-1"].handled).toBe(true);
    expect(ov._projects.list[0].id).toBe("p1");
    expect(ov._nomerge).toEqual(["alpha|beta"]);
    expect(ov._invoiceEditLearning).toEqual([{ field: "unitPrice" }]);
    expect(ov._auditLog.byId.a.id).toBe("a");
  });

  it("an older _savedAt is skipped on POST and on PATCH", () => {
    const posted = mergeIncomingOv(
      storedWith(),
      stateWriteBody("POST", { ov: { "JP-NEW": { notes: "stale", _savedAt: 100, _version: 1 } } }),
      NOW
    );
    expect(posted.ov["JP-NEW"].notes).toBe("fresh");
    expect(posted.skipped.map((s) => s.key)).toEqual(["JP-NEW"]);

    const patched = mergeIncomingOv(
      storedWith(),
      stateWriteBody("PATCH", { id: "JP-NEW", patch: { notes: "stale" }, base: { _savedAt: 100, _version: 1 } }),
      NOW
    );
    expect(patched.ov["JP-NEW"].notes).toBe("fresh");
    expect(patched.skipped[0].reason).toBe("older_stamp");
  });

  it("tombstone delete still applies and survives a stale full object", () => {
    const deleted = mergeIncomingOv(storedWith(), stateWriteBody("POST", { op: "delete", ids: ["JP-KEEP"] }), NOW);
    expect(deleted.ov["JP-KEEP"]._deleted).toBe(true);
    expect(deleted.ov["JP-KEEP"].customer).toBe("Keep me");
    expect(deleted.ov["JP-NEW"].customer).toBe("Newer");

    const stale = mergeIncomingOv(
      deleted.ov,
      stateWriteBody("POST", {
        ov: { "JP-KEEP": { customer: "revived", _savedAt: 500, _version: 3 } },
      }),
      NOW + 5
    );
    expect(stale.ov["JP-KEEP"]._deleted).toBe(true);
    expect(stale.ov["JP-KEEP"].customer).toBe("Keep me");
    expect(stale.skipped.some((s) => s.key === "JP-KEEP")).toBe(true);
  });

  it("an empty POST does not rotate a backup", async () => {
    const store = createMemoryStore({ "ov-v1": { ov: storedWith(), ts: 10 } });
    const res = await saveJobState(store, stateWriteBody("POST", { ov: {} }), NOW);
    expect(res.unchanged).toBe(true);
    expect((await store.get("ov-v1")).ov["JP-NEW"].customer).toBe("Newer");
    expect(await store.get("ov-v1-bak-1")).toBeNull();
  });

  it("a partial local job normalizes and a bad invoiceHistory no longer throws on slice", () => {
    const sparse = { id: "local-1790228127169", customer: "Hand entered", address: "9 Bond St" };
    expect(() => stageOf(sparse)).not.toThrow();
    const bad = { invoiceHistory: { bad: true } };
    expect(() => (bad.invoiceHistory || []).slice()).toThrow(TypeError);
    const jobs = mergeJobs([], {
      "local-1790228127169": { customer: "Hand entered", address: "9 Bond St", invoiceHistory: { bad: true }, amount: "$42" },
      "GHOST-1": { customer: "Not new, not base" },
    });
    const job = jobs.find((j) => j.id === "local-1790228127169");
    expect(job).toBeTruthy();
    expect(job._new).toBe(true);
    expect(job.amount).toBe("$42");
    expect(job.followUp).toEqual({ text: "", date: "" });
    expect(job.status.Lead.s).toBe("current");
    expect(Array.isArray(job.invoiceHistory)).toBe(true);
    expect(() => job.invoiceHistory.slice()).not.toThrow();
    expect(jobs.find((j) => j.id === "GHOST-1")).toBeUndefined();
    const kept = normalizeJob({ id: "J", amount: "$5", payments: [{ amount: 5 }] });
    expect(kept.amount).toBe("$5");
    expect(kept.payments).toEqual([{ amount: 5 }]);
  });
});
