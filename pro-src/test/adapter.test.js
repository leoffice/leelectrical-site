// Unit tests for the NetlifyStoreAdapter merge logic (mocked fetch).
// Merge semantics match app/sleek.html's merge2(): objects merge recursively,
// arrays and scalars are REPLACED by the overlay.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOverlay, blankJob, deepMerge, mergeJobs } from "../src/data/merge.js";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";

const BASE_JOB = {
  id: "JP-001",
  customer: "Peretz Chein",
  title: "Main panel upgrade",
  amount: "$2,300",
  invoiceNo: "251841",
  paid: false,
  notes: "",
  invoiceHistory: [{ date: "2026-06-30", kind: "Invoice sent" }],
  status: { Lead: { s: "done", d: "2026-06-29" }, "Site Visit": { s: "skipped" } },
};

describe("deepMerge", () => {
  it("merges nested objects, patch wins on scalars", () => {
    const out = deepMerge({ a: 1, b: { x: 1, y: 2 } }, { a: 9, b: { y: 3, z: 4 } });
    expect(out).toEqual({ a: 9, b: { x: 1, y: 3, z: 4 } });
  });
  it("does not mutate inputs", () => {
    const base = { b: { x: 1 } };
    deepMerge(base, { b: { x: 2 } });
    expect(base.b.x).toBe(1);
  });
  it("replaces arrays instead of merging them", () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});

describe("applyOverlay (sleek merge2 semantics)", () => {
  it("overlay fields win over base", () => {
    const m = applyOverlay(BASE_JOB, { amount: "$2,500", paid: true });
    expect(m.amount).toBe("$2,500");
    expect(m.paid).toBe(true);
    expect(m.customer).toBe("Peretz Chein"); // untouched base field survives
  });
  it("merges status per-stage (does not wipe other stages)", () => {
    const m = applyOverlay(BASE_JOB, { status: { Invoiced: { s: "done", d: "2026-07-01" } } });
    expect(m.status.Invoiced).toEqual({ s: "done", d: "2026-07-01" });
    expect(m.status.Lead).toEqual({ s: "done", d: "2026-06-29" });
    expect(m.status["Site Visit"]).toEqual({ s: "skipped" });
  });
  it("REPLACES invoiceHistory (overlay stores the full list, like sleek)", () => {
    const m = applyOverlay(BASE_JOB, {
      invoiceHistory: [
        { date: "2026-06-30", kind: "Invoice sent" },
        { date: "2026-07-02", kind: "Reminder" },
      ],
    });
    expect(m.invoiceHistory).toHaveLength(2);
    expect(m.invoiceHistory[1].kind).toBe("Reminder");
  });
});

describe("mergeJobs", () => {
  const ov = {
    "JP-001": { amount: "$2,500", status: { Invoiced: { s: "done" } } },
    "LOCAL-9": { _new: true, customer: "New Guy", title: "Outlet swap" },
    "JP-002": { _deleted: true },
    "JP-003": { _archived: true },
    "GHOST-1": { customer: "Not new, not base" }, // no _new -> ignored
  };
  const base = [BASE_JOB, { id: "JP-002", customer: "Gone" }, { id: "JP-003", customer: "Archived" }];

  it("overlay wins, _new jobs included, _deleted dropped, _archived kept+flagged", () => {
    const out = mergeJobs(base, ov);
    const ids = out.map((j) => j.id).sort();
    expect(ids).toEqual(["JP-001", "JP-003", "LOCAL-9"]);
    expect(out.find((j) => j.id === "JP-001").amount).toBe("$2,500");
    expect(out.find((j) => j.id === "JP-003")._archived).toBe(true); // Archive tab needs it
    const local = out.find((j) => j.id === "LOCAL-9");
    expect(local.customer).toBe("New Guy");
    expect(local.status).toEqual(blankJob("LOCAL-9").status); // scaffolded from blank
  });
  it("handles empty overlay and empty base", () => {
    expect(mergeJobs([BASE_JOB], null)).toHaveLength(1);
    expect(mergeJobs([], { "LOCAL-1": { _new: true } })).toHaveLength(1);
    expect(mergeJobs([], {})).toEqual([]);
  });
});

describe("NetlifyStoreAdapter (mocked fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(routes) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts = {}) => {
        const path = String(url).split("/functions/")[1].split("?")[0];
        calls.push({ path, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
        const handler = routes[path];
        const data = typeof handler === "function" ? handler(calls[calls.length - 1]) : handler;
        return { ok: true, status: 200, json: async () => data };
      })
    );
    return calls;
  }

  it("listJobsMeta merges jobsdata with the state overlay + returns syncedAt", async () => {
    stubFetch({
      jobsdata: { jobs: [BASE_JOB], syncedAt: 1234 },
      state: { ov: { "JP-001": { paid: true }, "LOCAL-9": { _new: true, customer: "New Guy" } }, ts: 2 },
    });
    const api = createNetlifyAdapter();
    const meta = await api.listJobsMeta();
    expect(meta.jobs).toHaveLength(2);
    expect(meta.syncedAt).toBe(1234);
    expect(meta.jobs.find((j) => j.id === "JP-001").paid).toBe(true);
  });

  it("saveJob fetches latest ov, deep-merges the patch, posts full ov back", async () => {
    const serverOv = {
      "JP-001": { notes: "existing note", status: { Lead: { s: "done" } } },
      "JP-777": { paid: true }, // other job's edits must survive the POST
    };
    const calls = stubFetch({
      state: (call) => (call.method === "POST" ? { ok: true, ts: 99 } : { ov: serverOv, ts: 5 }),
    });
    const api = createNetlifyAdapter();
    await api.saveJob("JP-001", { paid: true, status: { Invoiced: { s: "done" } } });

    const post = calls.find((c) => c.method === "POST");
    expect(post).toBeTruthy();
    expect(post.body.ov["JP-777"]).toEqual({ paid: true }); // not clobbered
    expect(post.body.ov["JP-001"]).toEqual({
      notes: "existing note",
      status: { Lead: { s: "done" }, Invoiced: { s: "done" } }, // per-stage merge
      paid: true,
    });
  });

  it("second saveJob uses session cache when GET is still lagging (no multi-second wait)", async () => {
    const serverOv = {
      "JP-001": { notes: "n1" },
      "JP-777": { paid: true },
    };
    let postTs = 10;
    // After first write, GETs keep returning the pre-write snapshot (blob lag).
    let postCount = 0;
    const calls = stubFetch({
      state: (call) => {
        if (call.method === "POST") {
          postCount += 1;
          postTs += 1;
          // Mirror a real server: accept the posted ov.
          Object.assign(serverOv, call.body.ov);
          return { ok: true, ts: postTs };
        }
        // Always lag: ts stays below last write so adapter falls back to cache.
        return { ov: { "JP-001": { notes: "n1" }, "JP-777": { paid: true } }, ts: 5 };
      },
    });
    const api = createNetlifyAdapter();
    await api.saveJob("JP-001", { paid: true });
    await api.saveJob("JP-001", { notes: "n2" });

    const posts = calls.filter((c) => c.method === "POST" && c.path === "state");
    expect(posts).toHaveLength(2);
    // Second POST must keep JP-777 and merge notes/paid from cache + patch.
    expect(posts[1].body.ov["JP-777"]).toEqual({ paid: true });
    expect(posts[1].body.ov["JP-001"]).toEqual({ notes: "n2", paid: true });
    expect(postCount).toBe(2);
  });



  it("enqueueCommand posts op:enqueue with the exact idempotencyKey + surfaces dedupe", async () => {
    const calls = stubFetch({
      command: (call) => ({
        ok: true,
        deduped: true,
        command: { ...call.body.command, id: "c1", status: "queued" },
      }),
    });
    const api = createNetlifyAdapter();
    const { command, deduped } = await api.enqueueCommand(
      "send_invoice",
      "JP-001",
      { email: "x@y.z", invoiceNo: "251841" },
      "deterministic",
      "send_invoice:251841"
    );
    expect(calls[0].body.op).toBe("enqueue");
    expect(calls[0].body.command.idempotencyKey).toBe("send_invoice:251841");
    expect(calls[0].body.command.lane).toBe("deterministic");
    expect(command.status).toBe("queued");
    expect(deduped).toBe(true);
  });

  it("updateCommand posts op:update (retry / approvals)", async () => {
    const calls = stubFetch({ command: { ok: true } });
    const api = createNetlifyAdapter();
    await api.updateCommand("c9", { status: "queued", attempts: 0, error: null }, "manual retry (pro)");
    expect(calls[0].body).toEqual({
      op: "update",
      id: "c9",
      patch: { status: "queued", attempts: 0, error: null },
      note: "manual retry (pro)",
    });
  });

  it("listCommands filters by jobId; dev/chat helpers hit the right fns", async () => {
    const calls = stubFetch({
      command: { commands: [{ id: "a", jobId: "JP-001" }, { id: "b", jobId: "JP-002" }] },
      devtasks: { ok: true, tasks: [] },
      chat: { ok: true, messages: [] },
      iterate: { ok: true },
      jobsdata: { ok: true },
    });
    const api = createNetlifyAdapter();
    expect(await api.listCommands("JP-001")).toHaveLength(1);
    expect(await api.listCommands()).toHaveLength(2);
    await api.addDevTask({ desc: "x" });
    await api.patchDevTask("t1", { status: "approved" });
    await api.chatSend("pro-1", "m1", "hi");
    await api.iterate("hi", "pro-bubble:pro-1");
    await api.requestSync();
    const bodies = calls.filter((c) => c.method === "POST").map((c) => [c.path, c.body.op || c.body.message || c.body.source]);
    expect(bodies).toContainEqual(["devtasks", "add"]);
    expect(bodies).toContainEqual(["devtasks", "patch"]);
    expect(bodies).toContainEqual(["chat", "msg"]);
    expect(bodies).toContainEqual(["jobsdata", "request"]);
    const it2 = calls.find((c) => c.path === "iterate");
    expect(it2.body).toEqual({ message: "hi", source: "pro-bubble:pro-1" });
  });
});
