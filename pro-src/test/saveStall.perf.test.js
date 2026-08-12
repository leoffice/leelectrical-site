// Save-path safety: with the incremental PATCH save (perf Batch B) a save
// never GETs the state blob at all, so the old stale-read stall (350+700+1050
// ≈ 2.1s retry sleep) and lost-key clobber class cannot occur on the new path.
// The legacy fallback (old server: PATCH is a no-op read, POST takes full ov)
// must still preserve prior writes — the original concurrent-edit safety.
import { afterEach, expect, test, vi } from "vitest";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";
import { deepMerge } from "../src/data/merge.js";

/** Fetch stub modelling the state fn. `legacy: true` = OLD server (no PATCH
 *  handler — PATCH falls through to a plain read and writes NOTHING).
 *  Set `store.staleReads = n` to make the next n GETs report an ancient ts. */
function stubStore({ legacy = false } = {}) {
  const store = { ov: {}, ts: 1000, staleReads: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1].split("?")[0];
      const method = o.method || "GET";
      const body = o.body ? JSON.parse(o.body) : null;
      if (path === "state") {
        if (method === "PATCH") {
          if (legacy) {
            // Old server: unknown method falls through to the read branch.
            const snap = JSON.parse(JSON.stringify(store.ov));
            return { ok: true, status: 200, json: async () => ({ ov: snap, ts: store.ts }) };
          }
          const id = String(body.id);
          store.ov[id] = deepMerge(store.ov[id] || {}, body.patch || {});
          if (id.charAt(0) !== "_") store.ov[id]._savedAt = Date.now();
          store.ts = Date.now();
          return { ok: true, status: 200, json: async () => ({ ok: true, ts: store.ts, patched: id }) };
        }
        if (method === "POST") {
          store.ov = body.ov;
          store.ts = Date.now();
          return { ok: true, status: 200, json: async () => ({ ok: true, ts: store.ts }) };
        }
        const snap = JSON.parse(JSON.stringify(store.ov));
        if (store.staleReads > 0) {
          store.staleReads--;
          return { ok: true, status: 200, json: async () => ({ ov: snap, ts: 1 }) };
        }
        return { ok: true, status: 200, json: async () => ({ ov: snap, ts: store.ts }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
  return store;
}

afterEach(() => vi.unstubAllGlobals());

test("saves are fast and GET-free — a lagging blob cannot stall or clobber the PATCH path", async () => {
  const store = stubStore();
  const api = createNetlifyAdapter();
  await api.saveJob("J-1", { notes: "first" });
  store.staleReads = 5; // even a badly lagging blob is irrelevant: saves never read
  const t0 = performance.now();
  await api.saveJob("J-2", { notes: "second" });
  const elapsed = performance.now() - t0;
  expect(elapsed).toBeLessThan(300); // was ~2100ms with the old retry sleep
  expect(store.ov["J-1"].notes).toBe("first"); // prior write survived
  expect(store.ov["J-2"].notes).toBe("second");
});

test("another device's concurrent key survives our save (server merges one id)", async () => {
  const store = stubStore();
  const api = createNetlifyAdapter();
  await api.saveJob("J-A", { notes: "A" });
  store.ov["J-OTHER"] = { notes: "other-device" }; // concurrent write from elsewhere
  await api.saveJob("J-A", { notes: "A2" });
  expect(store.ov["J-OTHER"]).toBeTruthy();
  expect(store.ov["J-A"].notes).toBe("A2");
});

test("LEGACY fallback (old server): stale read does not stall; lost key restored from session cache", async () => {
  const store = stubStore({ legacy: true });
  const api = createNetlifyAdapter();
  await api.saveJob("J-A", { notes: "A" }); // PATCH no-ops on old server -> legacy POST ran
  expect(store.ov["J-A"].notes).toBe("A");
  store.ov = {}; // lagging blob dropped our just-written key
  store.staleReads = 2; // both the PATCH read-through and the freshState GET lag
  const t0 = performance.now();
  await api.saveJob("J-B", { notes: "B" });
  const elapsed = performance.now() - t0;
  expect(elapsed).toBeLessThan(400); // one short 120ms retry max, no 2.1s sleep
  expect(store.ov["J-A"] && store.ov["J-A"].notes).toBe("A"); // restored from cachedOv
  expect(store.ov["J-B"].notes).toBe("B");
});
