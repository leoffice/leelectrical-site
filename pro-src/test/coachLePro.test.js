// Coach LE Pro access (/api/coach/*): auth, allowed edits, refusals, per-job
// merge (no stale wipe), write log + first-write snapshot, adapter refusal.
import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleCoach,
  isoET,
  validatePatch,
} from "../../netlify/functions/lib/coachLePro.mjs";
import { toPagesFunction } from "../../netlify/functions/lib/pagesAdapter.mjs";

const TOKEN = "test-coach-token-" + "x".repeat(40);
const ENV = { COACH_LEPRO_TOKEN_SHA256: createHash("sha256").update(TOKEN).digest("hex") };
const NOW = Date.parse("2026-10-07T18:30:00Z"); // 2:30 PM ET

function memStore(map, name) {
  const k = (key) => `${name}/${key}`;
  return {
    async get(key, opts = {}) {
      const raw = map.get(k(key));
      if (raw == null) return null;
      return opts.type === "json" ? JSON.parse(raw) : raw;
    },
    async setJSON(key, obj) { map.set(k(key), JSON.stringify(obj)); },
    async set(key, data) { map.set(k(key), typeof data === "string" ? data : JSON.stringify(data)); },
    async delete(key) { map.delete(k(key)); },
    async list() {
      return { blobs: [...map.keys()].filter((x) => x.startsWith(name + "/")).map((x) => ({ key: x.slice(name.length + 1) })) };
    },
  };
}

function seed(nJobs = 1200) {
  const map = new Map();
  const ov = {
    _pendingPayments: { items: [{ id: "pp1", amount: 500 }], ts: 1 },
    _auditLog: { byId: { a1: { id: "a1", at: "2026-10-01" } } },
    _projects: { p1: { name: "keep me" } },
  };
  const jobs = [];
  for (let i = 0; i < nJobs; i++) {
    const id = `test-${i}`;
    jobs.push({ id, customer: `Test Customer ${i}`, title: "Test job", notes: "", status: { Lead: { s: "done" } }, followUp: { date: "", text: "", type: "" }, amount: 100, paid: false });
    ov[id] = { email: `t${i}@example.test`, notes: `ov note ${i}` };
  }
  map.set("jobstate/ov-v1", JSON.stringify({ ov, ts: 111 }));
  map.set("jobsdata/jobsdata-v1", JSON.stringify({ jobs, ts: 1 }));
  map.set("customers/customers-v1", JSON.stringify({ list: [{ name: "Test", apiToken: "zzz" }] }));
  map.set("settings/tenant-settings-v1", JSON.stringify({ profile: { checkmakerAccounts: ["NOPE"] } }));
  return map;
}

function req(method, path, { token = TOKEN, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://preview.test/api/coach/${path}`, {
    method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

let map;
let deps;
beforeEach(() => {
  map = seed();
  deps = { getStore: (name) => memStore(map, name), now: () => NOW };
});
const call = async (method, path, opts) => {
  const r = await handleCoach(req(method, path, opts), ENV, deps);
  return { status: r.status, body: await r.json() };
};
const state = () => JSON.parse(map.get("jobstate/ov-v1"));

describe("auth", () => {
  it("missing credential -> 401", async () => {
    expect((await call("GET", "jobs", { token: "" })).status).toBe(401);
  });
  it("wrong / non-Coach bearer (e.g. a staff JWT) -> 401", async () => {
    expect((await call("GET", "jobs", { token: "eyJhbGciOi.fake.jwt" })).status).toBe(401);
    expect((await call("PATCH", "job/test-1", { token: "nope", body: { patch: { notes: "x" } } })).status).toBe(401);
    expect(state().ov["test-1"].notes).toBe("ov note 1");
  });
  it("no secret configured -> 503 fail closed", async () => {
    const r = await handleCoach(req("GET", "jobs"), {}, deps);
    expect(r.status).toBe(503);
  });
});

describe("read", () => {
  it("lists jobs merged with the overlay, and reads one job", async () => {
    const r = await call("GET", "jobs?q=customer 7");
    expect(r.status).toBe(200);
    expect(r.body.jobs.some((j) => j.id === "test-7")).toBe(true);
    const one = await call("GET", "job/test-7");
    expect(one.body.job.notes).toBe("ov note 7");
    expect(one.body.job.email).toBe("t7@example.test");
  });
  it("reads allowlisted stores with token-like fields redacted; settings refused", async () => {
    const c = await call("GET", "store/customers/customers-v1");
    expect(c.body.value.list[0].apiToken).toBe("[redacted]");
    expect((await call("GET", "store/settings/tenant-settings-v1")).status).toBe(403);
    expect((await call("GET", "store/paylinks")).status).toBe(403);
  });
  it("state read omits the audit log", async () => {
    const s = await call("GET", "state");
    expect(s.body.ov._auditLog).toBeUndefined();
    expect(s.body.ov._projects).toBeDefined();
  });
});

describe("allowed edits", () => {
  it("notes, follow-up, stage and job fields merge into one job only", async () => {
    const before = state();
    const r = await call("PATCH", "job/test-5", {
      body: {
        reason: "test",
        patch: {
          notes: "Coach: called, waiting on permit",
          followUp: { date: "2026-10-09", text: "Check permit", type: "Paperwork / permits" },
          status: { Scheduled: { s: "current", d: "2026-10-12" } },
          title: "Panel upgrade (test)",
        },
      },
    });
    expect(r.status).toBe(200);
    const after = state();
    const j = after.ov["test-5"];
    expect(j.notes).toBe("Coach: called, waiting on permit");
    expect(j.followUp.text).toBe("Check permit");
    expect(j.status.Scheduled).toEqual({ s: "current", d: "2026-10-12" });
    expect(j.title).toBe("Panel upgrade (test)");
    expect(j.email).toBe("t5@example.test"); // untouched field kept
    expect(j._savedAt).toBe(NOW);
    // every other key identical
    for (const k of Object.keys(before.ov)) {
      if (k === "test-5" || k === "_auditLog") continue;
      expect(after.ov[k]).toEqual(before.ov[k]);
    }
    expect(after.ov._auditLog).toEqual(before.ov._auditLog);
    expect(Object.keys(after.ov).length).toBe(Object.keys(before.ov).length);
    // a backup slot was rotated
    expect(JSON.parse(map.get("jobstate/ov-v1-bak-1")).ov["test-5"].notes).toBe("ov note 5");
  });
  it("can edit a base-only job (no overlay row yet)", async () => {
    const s = state(); delete s.ov["test-9"]; map.set("jobstate/ov-v1", JSON.stringify(s));
    const r = await call("PATCH", "job/test-9", { body: { patch: { notes: "hi" } } });
    expect(r.status).toBe(200);
    expect(state().ov["test-9"].notes).toBe("hi");
  });
});

describe("forbidden actions are refused and write nothing", () => {
  const snap = () => map.get("jobstate/ov-v1");
  const cases = [
    ["payment: paid flag", "PATCH", "job/test-1", { patch: { paid: true } }, "payment_forbidden"],
    ["payment: payments list", "PATCH", "job/test-1", { patch: { payments: [{ amount: 1 }] } }, "payment_forbidden"],
    ["payment: openBalance", "PATCH", "job/test-1", { patch: { openBalance: 0 } }, "payment_forbidden"],
    ["payment: Paid stage", "PATCH", "job/test-1", { patch: { status: { Paid: { s: "done" } } } }, "payment_forbidden"],
    ["payment: Deposit Receipt stage", "PATCH", "job/test-1", { patch: { status: { "Deposit Receipt": { s: "done" } } } }, "payment_forbidden"],
    ["payment: allowed + forbidden mixed", "PATCH", "job/test-1", { patch: { notes: "ok", amount: 1 } }, "payment_forbidden"],
    ["zelle apply: pending list", "PATCH", "job/_pendingPayments", { patch: { notes: "x" } }, "payment_forbidden"],
    ["zelle apply: pendingZellePayment", "PATCH", "job/test-1", { patch: { pendingZellePayment: { amount: 5 } } }, "payment_forbidden"],
    ["send: invoiceEmailedAt", "PATCH", "job/test-1", { patch: { invoiceEmailedAt: "now" } }, "send_forbidden"],
    ["send: POST /send", "POST", "send", { to: "c@example.test" }, "forbidden"],
    ["send: POST /customer-email", "POST", "customer-email", { to: "c@example.test" }, "forbidden"],
    ["delete: DELETE job", "DELETE", "job/test-1", undefined, "delete_forbidden"],
    ["delete: op:delete body", "PATCH", "job/test-1", { op: "delete" }, "delete_forbidden"],
    ["delete: _deleted field", "PATCH", "job/test-1", { patch: { _deleted: true } }, "delete_forbidden"],
    ["delete: archive", "PATCH", "job/test-1", { patch: { _archived: true } }, "delete_forbidden"],
    ["full ov overwrite: body.ov", "PATCH", "job/test-1", { ov: { "test-1": { notes: "x" } } }, "full_ov_forbidden"],
    ["full ov overwrite: POST state", "POST", "state", { ov: {} }, "forbidden"],
    ["unknown field", "PATCH", "job/test-1", { patch: { qboCustomerId: "1" } }, "payment_forbidden"],
    ["reserved key", "PATCH", "job/_projects", { patch: { notes: "x" } }, "reserved_key_forbidden"],
  ];
  for (const [name, method, path, body, err] of cases) {
    it(name, async () => {
      const before = snap();
      const r = await call(method, path, { body });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe(err);
      expect(snap()).toBe(before);
      expect([...map.keys()].some((k) => k.startsWith("coachlog/w/"))).toBe(false);
    });
  }
});

describe("stale writes cannot wipe other jobs or keys", () => {
  it("merges onto CURRENT server state, not a stale copy", async () => {
    // Another device changes job test-2 after Coach last read.
    const s = state(); s.ov["test-2"].notes = "fresh from office"; s.ov["new-job"] = { notes: "new" };
    map.set("jobstate/ov-v1", JSON.stringify(s));
    const r = await call("PATCH", "job/test-3", { body: { patch: { notes: "coach edit" } } });
    expect(r.status).toBe(200);
    const after = state();
    expect(after.ov["test-2"].notes).toBe("fresh from office");
    expect(after.ov["new-job"]).toEqual({ notes: "new" });
    expect(after.ov._pendingPayments).toEqual(s.ov._pendingPayments);
    expect(after.ov._projects).toEqual(s.ov._projects);
    expect(Object.keys(after.ov).length).toBe(Object.keys(s.ov).length);
  });
  it("refuses to write when the state read is missing (no wipe)", async () => {
    map.delete("jobstate/ov-v1");
    const r = await call("PATCH", "job/test-3", { body: { patch: { notes: "x" } } });
    expect(r.status).toBe(503);
    expect(map.has("jobstate/ov-v1")).toBe(false);
  });
  it("refuses to write when the state looks wiped (too few jobs)", async () => {
    map.set("jobstate/ov-v1", JSON.stringify({ ov: { "test-3": {} }, ts: 1 }));
    const r = await call("PATCH", "job/test-3", { body: { patch: { notes: "x" } } });
    expect(r.status).toBe(503);
    expect(state().ov).toEqual({ "test-3": {} });
  });
  it("refuses to edit a deleted job (no resurrection)", async () => {
    const s = state(); s.ov["test-4"]._deleted = true; map.set("jobstate/ov-v1", JSON.stringify(s));
    expect((await call("PATCH", "job/test-4", { body: { patch: { notes: "x" } } })).status).toBe(409);
  });
});

describe("write log + first-write snapshot", () => {
  it("logs actor, job id, field, old -> new, ET timestamp; snapshots once", async () => {
    const original = map.get("jobstate/ov-v1");
    const r = await call("PATCH", "job/test-6", {
      body: { patch: { notes: "n2", status: { Estimate: { s: "done" } } }, reason: "test" },
    });
    expect(r.status).toBe(200);
    const logKeys = [...map.keys()].filter((k) => k.startsWith("coachlog/w/"));
    expect(logKeys.length).toBe(1);
    const entry = JSON.parse(map.get(logKeys[0]));
    expect(entry.status).toBe("applied");
    expect(entry.at).toBe("2026-10-07T14:30:00-04:00");
    expect(entry.rows).toEqual([
      { actor: "coach", jobId: "test-6", field: "notes", old: "ov note 6", new: "n2", at: "2026-10-07T14:30:00-04:00" },
      { actor: "coach", jobId: "test-6", field: "status.Estimate", old: null, new: { s: "done" }, at: "2026-10-07T14:30:00-04:00" },
    ]);
    const meta = JSON.parse(map.get("coachlog/snapshot-meta"));
    expect(meta.sha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(map.get(meta.key)).toBe(original);
    // second write: new log row, same snapshot
    await call("PATCH", "job/test-6", { body: { patch: { notes: "n3" } } });
    expect([...map.keys()].filter((k) => k.startsWith("coachlog/snapshot/")).length).toBe(1);
    const log = await call("GET", "log");
    expect(log.body.entries.length).toBe(2);
    expect(log.body.snapshot.sha256).toBe(meta.sha256);
  });
  it("marks the log row failed if the state write throws", async () => {
    const base = deps.getStore;
    deps.getStore = (name) => {
      const s = base(name);
      if (name === "jobstate") s.setJSON = async () => { throw new Error("kv down"); };
      return s;
    };
    const r = await call("PATCH", "job/test-6", { body: { patch: { notes: "x" } } });
    expect(r.status).toBe(500);
    const k = [...map.keys()].find((x) => x.startsWith("coachlog/w/"));
    expect(JSON.parse(map.get(k)).status).toBe("failed");
  });
  it("isoET handles winter offset", () => {
    expect(isoET(Date.parse("2026-12-01T17:00:00Z"))).toBe("2026-12-01T12:00:00-05:00");
  });
});

describe("Coach credential is refused on every other LE Pro endpoint", () => {
  it("adapter returns 403 coach_forbidden and never calls the handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const fn = toPagesFunction(handler);
    for (const p of ["state", "sola-charge", "customer-email", "send-doc-email", "pay-link", "zelle-vision"]) {
      const r = await fn({
        request: new Request(`https://preview.test/.netlify/functions/${p}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{}" }),
        env: ENV,
      });
      expect(r.status).toBe(403);
      expect((await r.json()).error).toBe("coach_forbidden");
    }
    expect(handler).not.toHaveBeenCalled();
    const ok = await fn({ request: new Request("https://preview.test/.netlify/functions/state"), env: ENV });
    expect(await ok.text()).toBe("ok");
  });
});

describe("validatePatch", () => {
  it("rejects bad stage values and empty patches", () => {
    expect(validatePatch({}).ok).toBe(false);
    expect(validatePatch({ status: { Scheduled: { s: "bogus" } } }).ok).toBe(false);
    expect(validatePatch({ status: { NotAStage: { s: "done" } } }).ok).toBe(false);
    expect(validatePatch({ followUp: { text: "x", evil: 1 } }).ok).toBe(false);
    expect(validatePatch({ followUp: null }).ok).toBe(true);
  });
});
