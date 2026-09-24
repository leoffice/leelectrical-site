import { describe, expect, it } from "vitest";
import { mergeIncomingOv, saveJobState } from "../../netlify/functions/lib/ovMerge.mjs";
import { createMemoryStore } from "../src/lib/backup.js";

const NOW = 1_700_000_000_000;

function storedWith(extra = {}) {
  return {
    "JP-KEEP": { customer: "Keep me", notes: "original", _savedAt: 500, _version: 3 },
    "JP-NEW": { customer: "Newer", notes: "fresh", _savedAt: 900, _version: 4 },
    _sasTickets: { "call-1": { handled: true, jobId: "JP-KEEP" }, _savedAt: 500, _version: 2 },
    _projects: { list: [{ id: "p1", name: "Tower" }], _savedAt: 500, _version: 1 },
    _nomerge: ["alpha|beta"],
    _ovStamp: { _nomerge: { _savedAt: 500, _version: 1 } },
    ...extra,
  };
}

describe("mergeIncomingOv", () => {
  it("a stale full ov that omits keys does not delete them", () => {
    const { ov, skipped, changed } = mergeIncomingOv(
      storedWith(),
      { ov: { "JP-KEEP": { notes: "from stale tab" } } },
      NOW
    );
    expect(ov["JP-NEW"].customer).toBe("Newer");
    expect(ov["JP-KEEP"].notes).toBe("from stale tab");
    expect(ov["JP-KEEP"].customer).toBe("Keep me");
    expect(ov._sasTickets["call-1"].handled).toBe(true);
    expect(ov._projects.list[0].name).toBe("Tower");
    expect(ov._nomerge).toEqual(["alpha|beta"]);
    expect(skipped).toEqual([]);
    expect(changed).toBe(true);
  });

  it("an older _savedAt or _version does not overwrite a newer key", () => {
    const { ov, skipped } = mergeIncomingOv(
      storedWith(),
      {
        ov: {
          "JP-NEW": { notes: "stale overwrite", _savedAt: 100, _version: 4 },
          "JP-KEEP": { notes: "also stale", _version: 1 },
        },
      },
      NOW
    );
    expect(ov["JP-NEW"].notes).toBe("fresh");
    expect(ov["JP-KEEP"].notes).toBe("original");
    expect(skipped.map((s) => s.key).sort()).toEqual(["JP-KEEP", "JP-NEW"]);
    expect(skipped.every((s) => s.reason === "older_stamp")).toBe(true);
  });

  it("an equal stamp can still merge, and a missing stamp merges without deleting", () => {
    const { ov, skipped } = mergeIncomingOv(
      storedWith(),
      { ov: { "JP-NEW": { notes: "same generation", _savedAt: 900, _version: 4 } } },
      NOW
    );
    expect(skipped).toEqual([]);
    expect(ov["JP-NEW"].notes).toBe("same generation");
    expect(ov["JP-NEW"]._savedAt).toBe(NOW);
    expect(ov["JP-NEW"]._version).toBe(5);
  });

  it("keeps _deleted and still applies an explicit delete", () => {
    const first = mergeIncomingOv(storedWith(), { ov: { "JP-KEEP": { _deleted: true, _savedAt: 500, _version: 3 } } }, NOW);
    expect(first.ov["JP-KEEP"]._deleted).toBe(true);
    expect(first.ov["JP-KEEP"].customer).toBe("Keep me");

    const staleFull = mergeIncomingOv(
      first.ov,
      { ov: { "JP-KEEP": { customer: "revived", notes: "old tab", _savedAt: 500, _version: 3 } } },
      NOW + 10
    );
    expect(staleFull.ov["JP-KEEP"]._deleted).toBe(true);
    expect(staleFull.ov["JP-KEEP"].customer).toBe("Keep me");
    expect(staleFull.skipped.some((s) => s.key === "JP-KEEP")).toBe(true);

    const deleted = mergeIncomingOv(storedWith(), { op: "delete", ids: ["JP-NEW"] }, NOW);
    expect(deleted.ov["JP-NEW"]._deleted).toBe(true);
    expect(deleted.ov["JP-NEW"].customer).toBe("Newer");
    expect(deleted.ov["JP-KEEP"]._deleted).toBeUndefined();
  });

  it("an unstamped rewrite keeps an existing tombstone", () => {
    const tomb = {
      "JP-KEEP": { customer: "Keep me", _deleted: true, _savedAt: 500, _version: 4 },
    };
    const { ov } = mergeIncomingOv(tomb, { ov: { "JP-KEEP": { notes: "late edit" } } }, NOW);
    expect(ov["JP-KEEP"]._deleted).toBe(true);
    expect(ov["JP-KEEP"].notes).toBe("late edit");
  });

  it("special keys survive and still deep-merge", () => {
    const { ov } = mergeIncomingOv(
      storedWith(),
      {
        ov: {
          _sasTickets: { "call-2": { handled: true } },
          _projects: { list: [{ id: "p1", name: "Tower" }, { id: "p2", name: "Annex" }] },
          _nomerge: ["alpha|beta", "gamma|delta"],
        },
      },
      NOW
    );
    expect(ov._sasTickets["call-1"].handled).toBe(true);
    expect(ov._sasTickets["call-2"].handled).toBe(true);
    expect(ov._projects.list.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(ov._nomerge).toEqual(["alpha|beta", "gamma|delta"]);
    expect(ov._ovStamp._nomerge._version).toBe(2);
    expect(ov["JP-KEEP"].customer).toBe("Keep me");
  });

  it("ignores a client-supplied _ovStamp and stamps local-* with _new", () => {
    const { ov, changed } = mergeIncomingOv(
      { "JP-KEEP": { notes: "a", _savedAt: 5, _version: 1 } },
      {
        ov: {
          _ovStamp: { "JP-KEEP": { _savedAt: 1, _version: 99 } },
          "local-1790228127169": { address: "9 Bond St", customer: "Direct" },
        },
      },
      NOW
    );
    expect(changed).toBe(true);
    expect(ov["JP-KEEP"].notes).toBe("a");
    expect(ov["JP-KEEP"]._version).toBe(1);
    expect(ov["local-1790228127169"]._new).toBe(true);
    expect(ov["local-1790228127169"].address).toBe("9 Bond St");
    expect(ov["local-1790228127169"].customer).toBe("Direct");
    expect(ov["local-1790228127169"].amount).toBeUndefined();
  });

  it("an empty post does not wipe or rotate a backup", async () => {
    const store = createMemoryStore({
      "ov-v1": { ov: storedWith(), ts: 10 },
    });
    const res = await saveJobState(store, { ov: {} }, NOW);
    expect(res.unchanged).toBe(true);
    expect(res.skipped).toEqual([]);
    const live = await store.get("ov-v1");
    expect(live.ov["JP-NEW"].customer).toBe("Newer");
    expect(live.ts).toBe(10);
    expect(await store.get("ov-v1-bak-1")).toBeNull();
  });

  it("a real write rotates a backup and returns skipped keys without the full ov", async () => {
    const store = createMemoryStore({
      "ov-v1": { ov: storedWith(), ts: 10 },
    });
    const res = await saveJobState(
      store,
      {
        op: "patch",
        ov: {
          "JP-KEEP": { notes: "updated" },
          "JP-NEW": { notes: "too old", _savedAt: 1, _version: 1 },
        },
      },
      NOW
    );
    expect(res.ok).toBe(true);
    expect(res.ts).toBe(NOW);
    expect(res.ov).toBeUndefined();
    expect(res.skipped.map((s) => s.key)).toEqual(["JP-NEW"]);
    expect(res.stamps["JP-KEEP"]._savedAt).toBe(NOW);
    const live = await store.get("ov-v1");
    expect(live.ov["JP-KEEP"].notes).toBe("updated");
    expect(live.ov["JP-NEW"].notes).toBe("fresh");
    expect(live.ov._sasTickets["call-1"].jobId).toBe("JP-KEEP");
    const bak = await store.get("ov-v1-bak-1");
    expect(bak.ov["JP-NEW"].notes).toBe("fresh");
    expect(bak.backedUpAt).toBeTruthy();
  });
});
