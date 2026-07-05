// Unit tests for the NetlifyStoreAdapter merge logic (mocked fetch).
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

describe("applyOverlay", () => {
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
  it("appends invoiceHistory instead of replacing", () => {
    const m = applyOverlay(BASE_JOB, { invoiceHistory: [{ date: "2026-07-02", kind: "Reminder" }] });
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

  it("overlay wins, overlay-only _new jobs included, deleted/archived skipped", () => {
    const out = mergeJobs(base, ov);
    const ids = out.map((j) => j.id).sort();
    expect(ids).toEqual(["JP-001", "LOCAL-9"]);
    expect(out.find((j) => j.id === "JP-001").amount).toBe("$2,500");
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
        const path = String(url).split("/functions/")[1];
        calls.push({ path, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
        const handler = routes[path];
        const data = typeof handler === "function" ? handler(calls[calls.length - 1]) : handler;
        return { ok: true, status: 200, json: async () => data };
      })
    );
    return calls;
  }

  it("listJobs merges jobsdata with the state overlay", async () => {
    stubFetch({
      jobsdata: { jobs: [BASE_JOB], syncedAt: 1 },
      state: { ov: { "JP-001": { paid: true }, "LOCAL-9": { _new: true, customer: "New Guy" } }, ts: 2 },
    });
    const api = createNetlifyAdapter();
    const jobs = await api.listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.id === "JP-001").paid).toBe(true);
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

  it("enqueueCommand posts op:enqueue with an idempotencyKey", async () => {
    const calls = stubFetch({
      command: (call) => ({ ok: true, command: { ...call.body.command, id: "c1", status: "queued" } }),
    });
    const api = createNetlifyAdapter();
    const cmd = await api.enqueueCommand("send_invoice", "JP-001", { to: "x@y.z" }, "deterministic", "send_invoice|JP-001|1");
    expect(calls[0].body.op).toBe("enqueue");
    expect(calls[0].body.command.idempotencyKey).toBe("send_invoice|JP-001|1");
    expect(calls[0].body.command.lane).toBe("deterministic");
    expect(cmd.status).toBe("queued");
  });

  it("listCommands filters by jobId", async () => {
    stubFetch({
      command: { commands: [{ id: "a", jobId: "JP-001" }, { id: "b", jobId: "JP-002" }] },
    });
    const api = createNetlifyAdapter();
    expect(await api.listCommands("JP-001")).toHaveLength(1);
    expect(await api.listCommands()).toHaveLength(2);
  });
});
