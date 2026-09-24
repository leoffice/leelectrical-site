import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeIncomingOv, saveJobState, stateWriteBody } from "../../netlify/functions/lib/ovMerge.mjs";
import { createMemoryStore } from "../src/lib/backup.js";

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

describe("state write merge", () => {
  it("the Pages handler merges through ovMerge and does not replace ov", () => {
    const src = readFileSync(new URL("../../netlify/functions/state.mjs", import.meta.url), "utf8");
    expect(src).toContain("mergeIncomingOv");
    expect(src).toContain("stateWriteBody");
    expect(src).not.toMatch(/const ov = body\.ov/);
    expect(src).toContain("rotateJsonBackup");
    expect(src).toContain("capAuditLog");
  });

  it("a partial POST with one key does not drop other keys", () => {
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

  it("an empty ov POST is a no-op", async () => {
    const store = createMemoryStore({ "ov-v1": { ov: storedWith(), ts: 10 } });
    const res = await saveJobState(store, stateWriteBody("POST", { ov: {} }), NOW);
    expect(res.unchanged).toBe(true);
    expect(res.stamps).toEqual({});
    expect((await store.get("ov-v1")).ov["JP-NEW"].customer).toBe("Newer");
    expect((await store.get("ov-v1")).ov["JP-KEEP"].notes).toBe("original");
    expect(await store.get("ov-v1-bak-1")).toBeNull();

    const bare = await saveJobState(store, stateWriteBody("POST", {}), NOW);
    expect(bare.unchanged).toBe(true);
    expect((await store.get("ov-v1")).ov._auditLog.byId.a.id).toBe("a");
  });

  it("a stale stamp does not overwrite newer data", () => {
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

  it("a tombstone deletes only the named key", () => {
    const deleted = mergeIncomingOv(storedWith(), stateWriteBody("POST", { op: "delete", ids: ["JP-KEEP"] }), NOW);
    expect(deleted.ov["JP-KEEP"]._deleted).toBe(true);
    expect(deleted.ov["JP-KEEP"].customer).toBe("Keep me");
    expect(deleted.ov["JP-NEW"].customer).toBe("Newer");
    expect(deleted.ov["JP-NEW"]._deleted).toBeUndefined();
    expect(deleted.ov._sasTickets["call-1"].handled).toBe(true);
    expect(deleted.ov._auditLog.byId.a.id).toBe("a");

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
});
