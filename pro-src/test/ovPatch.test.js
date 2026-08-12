// Server-side incremental ov patch (perf Batch B) — merge semantics must
// match the client's data/merge.js, and the audit cap must actually trim.
import { describe, it, expect } from "vitest";
import { deepMerge, capAuditLog, AUDIT_LOG_CAP } from "../../netlify/functions/lib/ovPatch.mjs";
import { deepMerge as clientDeepMerge } from "../src/data/merge.js";

describe("ovPatch.deepMerge — matches client semantics", () => {
  const cases = [
    // objects merge recursively
    [{ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }],
    // arrays are REPLACED, not concatenated
    [{ lines: [{ q: 1 }, { q: 2 }] }, { lines: [{ q: 9 }] }],
    // scalars replaced; undefined skipped; null wins
    [{ a: 1, b: "x", c: 2 }, { a: 2, b: undefined, c: null }],
    // patch onto missing key
    [{}, { fresh: { deep: [1, 2, 3] } }],
    // non-object base replaced by object patch
    [{ a: 5 }, { a: { now: "obj" } }],
  ];
  for (const [base, patch] of cases) {
    it("case " + JSON.stringify(patch).slice(0, 40), () => {
      expect(deepMerge(base, patch)).toEqual(clientDeepMerge(base, patch));
    });
  }

  it("does not mutate inputs", () => {
    const base = { a: { x: 1 }, list: [1] };
    const patch = { a: { y: 2 } };
    deepMerge(base, patch);
    expect(base).toEqual({ a: { x: 1 }, list: [1] });
  });
});

describe("ovPatch.capAuditLog", () => {
  const entry = (i) => ({ id: "e" + i, at: new Date(1700000000000 + i * 1000).toISOString(), entityId: "J-1" });

  it("under cap: returned unchanged (same ref, no rewrite)", () => {
    const byId = {};
    for (let i = 0; i < 10; i++) byId["e" + i] = entry(i);
    const log = { byId, schema: 1 };
    expect(capAuditLog(log)).toBe(log);
  });

  it("over cap: keeps the NEWEST entries, drops oldest", () => {
    const byId = {};
    const n = AUDIT_LOG_CAP + 25;
    for (let i = 0; i < n; i++) byId["e" + i] = entry(i);
    const out = capAuditLog({ byId, schema: 1 });
    const ids = Object.keys(out.byId);
    expect(ids.length).toBe(AUDIT_LOG_CAP);
    expect(out.byId["e0"]).toBeUndefined();
    expect(out.byId["e24"]).toBeUndefined();
    expect(out.byId["e25"]).toBeTruthy();
    expect(out.byId["e" + (n - 1)]).toBeTruthy();
  });

  it("strips the legacy entries[] duplicate list", () => {
    const log = { byId: { e1: entry(1) }, entries: [entry(1)], schema: 1 };
    const out = capAuditLog(log);
    expect(out.entries).toBeUndefined();
    expect(out.byId.e1).toBeTruthy();
  });

  it("passes through junk shapes untouched", () => {
    expect(capAuditLog(null)).toBe(null);
    const noById = { entries: 5 };
    expect(capAuditLog(noById)).toBe(noById);
  });
});
