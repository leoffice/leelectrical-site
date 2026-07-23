// Verifies the save-path fix (netlifyAdapter freshState): a stale
// (eventually-consistent) state read must NOT trigger the old blocking retry
// sleep (350+700+1050 ≈ 2.1s), and must still preserve prior writes — the
// concurrent-edit safety. The live stall never reproduced in the app tests
// because the mock server always stamps a fresh ts; here we drive the lag.
import { afterEach, expect, test, vi } from "vitest";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";

/** Fetch stub modelling Netlify Blobs eventual consistency for /state.
 *  Set `store.staleReads = n` to make the next n GETs report an ancient ts
 *  (ts=1) — i.e. a read that predates our own last write. */
function stubStore() {
  const store = { ov: {}, ts: 1000, staleReads: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1].split("?")[0];
      const method = o.method || "GET";
      const body = o.body ? JSON.parse(o.body) : null;
      if (path === "state") {
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

test("stale read after a save does NOT stall (no 2.1s retry sleep) and keeps prior write", async () => {
  const store = stubStore();
  const api = createNetlifyAdapter();
  await api.saveJob("J-1", { notes: "first" }); // warms lastWriteTs + lastOv
  store.staleReads = 1; // next GET predates our write (blob lag)
  const t0 = performance.now();
  await api.saveJob("J-2", { notes: "second" });
  const elapsed = performance.now() - t0;
  expect(elapsed).toBeLessThan(300); // was ~2100ms with the old retry sleep
  expect(store.ov["J-1"]).toBeTruthy(); // our earlier write survived
  expect(store.ov["J-2"].notes).toBe("second");
});

test("stale read where the lagging blob has LOST our key — reconstruction restores it (no clobber)", async () => {
  const store = stubStore();
  const api = createNetlifyAdapter();
  await api.saveJob("J-A", { notes: "A" }); // lastOv now holds J-A
  store.ov = {}; // simulate a lagging blob that dropped our just-written key
  store.staleReads = 1;
  await api.saveJob("J-B", { notes: "B" });
  expect(store.ov["J-A"] && store.ov["J-A"].notes).toBe("A"); // restored from lastOv
  expect(store.ov["J-B"].notes).toBe("B");
});

test("fresh read stays authoritative — another device's concurrent key is preserved", async () => {
  const store = stubStore();
  const api = createNetlifyAdapter();
  await api.saveJob("J-A", { notes: "A" });
  // Another device added J-OTHER and the read is FRESH (ts current, not stale).
  store.ov = { ...store.ov, "J-OTHER": { notes: "other-device" } };
  store.ts = Date.now() + 10000;
  await api.saveJob("J-A", { notes: "A2" });
  expect(store.ov["J-OTHER"]).toBeTruthy(); // fresh read not overwritten by our lastOv
  expect(store.ov["J-A"].notes).toBe("A2");
});
