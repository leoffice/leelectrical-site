// Verifies item 3: ETag conditional GET. Server helper returns a bodyless 304
// when If-None-Match matches; the client reuses its cached parse on a 304 so an
// unchanged ~20MB blob costs a few bytes instead of a full re-transfer.
import { afterEach, expect, test, vi } from "vitest";
import { conditionalJson, etagFor } from "../../netlify/functions/lib/etag.mjs";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";

function reqWith(ifNoneMatch) {
  return { method: "GET", headers: { get: (h) => (h === "if-none-match" ? ifNoneMatch : null) } };
}

test("server: conditionalJson 304s on matching ETag, 200s otherwise", async () => {
  const doc = { jobs: [{ id: "J-1" }], syncedAt: 5, ts: 1234 };
  const etag = etagFor(doc.ts, "j"); // '"j1234"'

  const miss = conditionalJson(reqWith(null), doc, { prefix: "j", ts: doc.ts });
  expect(miss.status).toBe(200);
  expect(miss.headers.get("etag")).toBe(etag);
  expect(await miss.json()).toEqual(doc);

  const hit = conditionalJson(reqWith(etag), doc, { prefix: "j", ts: doc.ts });
  expect(hit.status).toBe(304);
  expect(hit.headers.get("etag")).toBe(etag);
  expect(await hit.text()).toBe(""); // no body on the wire

  const stale = conditionalJson(reqWith('"j0000"'), doc, { prefix: "j", ts: doc.ts });
  expect(stale.status).toBe(200); // client holds an old tag → full body
});

test("client: httpConditional reuses cached data on a 304 (no re-parse)", async () => {
  const bodies = {
    jobsdata: { jobs: [{ id: "J-1" }, { id: "J-2" }], syncedAt: 9, ts: 777 },
    state: { ov: {}, ts: 55 },
  };
  const etags = { jobsdata: '"j777"', state: '"s55"' };
  const seen = { jobsdata: 0, state: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1].split("?")[0];
      const inm = o.headers && o.headers["if-none-match"];
      seen[path] = (seen[path] || 0) + 1;
      if (seen[path] === 1) {
        expect(inm).toBeUndefined(); // first poll for this path: no cached tag
        return { ok: true, status: 200, headers: { get: (h) => (h === "etag" ? etags[path] : null) }, json: async () => bodies[path] };
      }
      expect(inm).toBe(etags[path]); // client sent the stored tag
      return { ok: true, status: 304, headers: { get: () => null }, json: async () => { throw new Error("must not parse a 304 body"); } };
    })
  );

  const api = createNetlifyAdapter();
  const a = await api.listJobsMeta(); // jobsdata + state: both 200 first time
  const b = await api.listJobsMeta(); // both revalidate → 304 → cached reuse
  expect(a.jobs.length).toBe(2);
  expect(b.jobs.length).toBe(2); // identical, served from the conditional cache
  expect(b.stateTs).toBe(55);
  vi.unstubAllGlobals();
});

test("client: command + calendar polls reuse cached data on a 304", async () => {
  const bodies = {
    command: { commands: [{ id: "c1", jobId: "J-1", status: "done" }], seq: 3, ts: 900 },
    calendar: { events: [{ id: "ev1", summary: "Estimate" }], syncedAt: 42, request: 0, ts: 12 },
  };
  const etags = { command: '"c900"', calendar: '"cal12"' };
  const seen = { command: 0, calendar: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1].split("?")[0];
      const inm = o.headers && o.headers["if-none-match"];
      seen[path] = (seen[path] || 0) + 1;
      if (seen[path] === 1) {
        expect(inm).toBeUndefined();
        return { ok: true, status: 200, headers: { get: (h) => (h === "etag" ? etags[path] : null) }, json: async () => bodies[path] };
      }
      expect(inm).toBe(etags[path]);
      return { ok: true, status: 304, headers: { get: () => null }, json: async () => { throw new Error("no 304 body"); } };
    })
  );

  const api = createNetlifyAdapter();
  expect((await api.listCommands()).length).toBe(1); // 200
  expect((await api.listCommands()).length).toBe(1); // 304 → cached
  expect((await api.listCommands("J-1")).length).toBe(1); // 304 → cached, then client-filtered
  expect((await api.listCommands("nope")).length).toBe(0); // filter applied to cached list
  const e1 = await api.listEventsMeta(); // 200
  const e2 = await api.listEventsMeta(); // 304 → cached
  expect(e1.syncedAt).toBe(42);
  expect(e2.syncedAt).toBe(42);
  vi.unstubAllGlobals();
});

afterEach(() => vi.unstubAllGlobals());
