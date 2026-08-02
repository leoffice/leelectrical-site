// paperwork-jobs — the app <-> fleet bridge for browser-driven paperwork.
//
// Levi's flow (2026-08-02): "Submit a Case" is completed IN THE APP; the app
// writes a paperwork job (status=queued). The local fleet agent (Angel +
// browser driver, skill coned-create-case proven on MC-941412) claims the job,
// fills the Energy Services wizard to Review, uploads a pre-submit SCREENSHOT
// and parks at awaiting_approval. Levi reviews the screenshot IN THE APP and
// approves — only then may the fleet click Submit (server-enforced red line:
// an update to `submitted` is rejected unless the job is `approved`).
//
// Lifecycle: queued -> in_progress -> awaiting_approval -> approved
//            -> submitted -> done          (any active -> failed; approval
//            can also -> rejected, which the fleet treats as abort)
//
// Ops (POST JSON):
//   App side (same-origin app, open like the other app endpoints):
//     { op:"create", type:"create_case", jobId, tenant?, payload } -> { ok, job }
//     { op:"list", jobId?, status?, type?, limit? }                -> { ok, jobs }
//     { op:"get", id }                                             -> { ok, job }
//     { op:"approve", id, approve:true|false, note? }              -> { ok, job }
//   Fleet side (requires header x-fleet-token == env PAPERWORK_FLEET_TOKEN):
//     { op:"claim", types?:["create_case"], agent }                -> { ok, job|null }
//     { op:"update", id, status?, screenshotB64?, screenshotMime?,
//       caseNumber?, error?, note?, agent? }                       -> { ok, job }
//
// Screenshots land in the shared docs store (key pwshot-*) and are served at
// /.netlify/functions/docs?key=<screenshotKey> — the app shows that URL on the
// approval screen. Contract doc: LEPRO_PAPERWORK_JOBS_FLEET_CONTRACT.md.
import { getStore } from "./lib/storage/index.mjs";
import { bytesFromBase64 } from "./lib/base64.mjs";

const STORE = "paperwork-jobs";
const RECENT_MAX = 200;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;

export const PAPERWORK_JOB_STATUSES = [
  "queued",
  "in_progress",
  "awaiting_approval",
  "approved",
  "rejected",
  "submitted",
  "done",
  "failed",
];

/** Allowed transitions. Key: from -> Set(to). */
const TRANSITIONS = {
  queued: new Set(["in_progress", "failed"]),
  in_progress: new Set(["awaiting_approval", "failed"]),
  awaiting_approval: new Set(["approved", "rejected", "failed", "awaiting_approval"]),
  // RED LINE: `submitted` is reachable ONLY from `approved`.
  approved: new Set(["submitted", "failed"]),
  rejected: new Set(["failed"]),
  submitted: new Set(["done", "failed"]),
  done: new Set([]),
  failed: new Set([]),
};

export function canTransition(from, to) {
  if (from === to) return from === "awaiting_approval"; // allow re-screenshot
  return !!TRANSITIONS[from]?.has(to);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-fleet-token",
    },
  });
}

const s = (v) => (v == null ? "" : String(v).trim());
const now = () => new Date().toISOString();

function newId() {
  return (
    "pj-" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function safeKeyPart(v, max = 24) {
  return s(v).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, max) || "x";
}

async function readJob(store, id) {
  return (await store.get(`job:${id}`, { type: "json", consistency: "strong" }).catch(() => null)) || null;
}

async function writeJob(store, job) {
  job.updatedAt = now();
  await store.setJSON(`job:${job.id}`, job);
  return job;
}

async function readList(store, key) {
  return (await store.get(key, { type: "json", consistency: "strong" }).catch(() => null)) || [];
}

function pushHistory(job, entry) {
  job.history = [...(job.history || []).slice(-29), { at: now(), ...entry }];
}

/** Fleet auth: constant-ish compare of x-fleet-token against the CF secret. */
function fleetAuth(req) {
  const configured = s(process.env.PAPERWORK_FLEET_TOKEN);
  if (!configured) return { ok: false, status: 503, error: "fleet_token_not_configured" };
  const given = s(req.headers.get("x-fleet-token"));
  if (!given || given.length !== configured.length) {
    return { ok: false, status: 403, error: "bad_fleet_token" };
  }
  let diff = 0;
  for (let i = 0; i < configured.length; i++) {
    diff |= configured.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0 ? { ok: true } : { ok: false, status: 403, error: "bad_fleet_token" };
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const op = s(body.op);
  const store = getStore(STORE);

  // ---------- APP SIDE ----------
  if (op === "create") {
    const type = s(body.type) || "create_case";
    const jobId = s(body.jobId);
    if (!jobId) return json({ ok: false, error: "missing jobId" }, 400);
    if (!body.payload || typeof body.payload !== "object") {
      return json({ ok: false, error: "missing payload" }, 400);
    }
    const job = {
      id: newId(),
      type,
      jobId,
      tenant: s(body.tenant) || "le",
      payload: body.payload,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      claimedBy: "",
      claimedAt: "",
      screenshotKey: "",
      screenshotUrl: "",
      caseNumber: "",
      error: "",
      note: "",
      history: [{ at: now(), status: "queued", by: "app" }],
    };
    await writeJob(store, job);
    const queueKey = `queue:${type}`;
    const queue = await readList(store, queueKey);
    await store.setJSON(queueKey, [...queue, job.id]);
    const recent = await readList(store, "recent");
    await store.setJSON("recent", [job.id, ...recent.filter((x) => x !== job.id)].slice(0, RECENT_MAX));
    return json({ ok: true, job });
  }

  if (op === "get") {
    const job = await readJob(store, s(body.id));
    if (!job) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, job });
  }

  if (op === "list") {
    const limit = Math.min(Number(body.limit) || 25, 100);
    const jobId = s(body.jobId);
    const status = s(body.status);
    const type = s(body.type);
    const recent = await readList(store, "recent");
    const out = [];
    for (const id of recent) {
      if (out.length >= limit) break;
      const job = await readJob(store, id);
      if (!job) continue;
      if (jobId && job.jobId !== jobId) continue;
      if (status && job.status !== status) continue;
      if (type && job.type !== type) continue;
      out.push(job);
    }
    return json({ ok: true, jobs: out });
  }

  if (op === "approve") {
    const job = await readJob(store, s(body.id));
    if (!job) return json({ ok: false, error: "not_found" }, 404);
    if (job.status !== "awaiting_approval") {
      return json({ ok: false, error: `not_awaiting_approval (status=${job.status})`, job }, 409);
    }
    const approve = body.approve === true;
    job.status = approve ? "approved" : "rejected";
    job.note = s(body.note) || job.note;
    pushHistory(job, { status: job.status, by: "levi", note: s(body.note) });
    await writeJob(store, job);
    return json({ ok: true, job });
  }

  // ---------- FLEET SIDE (token) ----------
  if (op === "claim" || op === "update") {
    const auth = fleetAuth(req);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  }

  if (op === "claim") {
    const types = Array.isArray(body.types) && body.types.length ? body.types.map(s) : ["create_case"];
    const agent = s(body.agent) || "fleet";
    for (const type of types) {
      const queueKey = `queue:${type}`;
      const queue = await readList(store, queueKey);
      while (queue.length) {
        const id = queue.shift();
        const job = await readJob(store, id);
        if (!job || job.status !== "queued") continue; // stale entry — drop it
        job.status = "in_progress";
        job.claimedBy = agent;
        job.claimedAt = now();
        pushHistory(job, { status: "in_progress", by: agent });
        await writeJob(store, job);
        await store.setJSON(queueKey, queue);
        return json({ ok: true, job });
      }
      await store.setJSON(queueKey, queue);
    }
    return json({ ok: true, job: null });
  }

  if (op === "update") {
    const job = await readJob(store, s(body.id));
    if (!job) return json({ ok: false, error: "not_found" }, 404);
    const agent = s(body.agent) || job.claimedBy || "fleet";
    const nextStatus = s(body.status);

    if (nextStatus && !PAPERWORK_JOB_STATUSES.includes(nextStatus)) {
      return json({ ok: false, error: `unknown status ${nextStatus}` }, 400);
    }
    if (nextStatus && !canTransition(job.status, nextStatus)) {
      // The red line lives here: in_progress -> submitted (skipping Levi's
      // approval) is refused, as is anything else off the lifecycle.
      return json(
        { ok: false, error: `bad_transition ${job.status} -> ${nextStatus}`, job },
        409
      );
    }

    // Pre-submit screenshot -> docs store, served via /docs?key=
    const shotB64 = s(body.screenshotB64).replace(/\s+/g, "");
    if (shotB64) {
      let bytes;
      try {
        bytes = bytesFromBase64(shotB64);
      } catch {
        return json({ ok: false, error: "bad screenshot base64" }, 400);
      }
      if (!bytes.length) return json({ ok: false, error: "empty screenshot" }, 400);
      if (bytes.length > MAX_SHOT_BYTES) return json({ ok: false, error: "screenshot too large" }, 413);
      const mime = s(body.screenshotMime) || "image/png";
      const key = `pwshot-${safeKeyPart(job.id.replace(/^pj-/, ""), 20)}-${Date.now().toString(36)}`;
      const docs = getStore("docs");
      await docs.set(key, bytes, {
        metadata: { mime, bytes: bytes.length, ts: Date.now(), filename: `${job.id}-review.png` },
      });
      job.screenshotKey = key;
      job.screenshotUrl = `/.netlify/functions/docs?key=${encodeURIComponent(key)}`;
    }

    if (s(body.caseNumber)) job.caseNumber = s(body.caseNumber);
    if (s(body.error)) job.error = s(body.error);
    if (s(body.note)) job.note = s(body.note);
    if (nextStatus) {
      job.status = nextStatus;
      pushHistory(job, { status: nextStatus, by: agent, note: s(body.note) });
    } else {
      pushHistory(job, { status: job.status, by: agent, note: s(body.note) || "update" });
    }
    await writeJob(store, job);
    return json({ ok: true, job });
  }

  return json({ ok: false, error: "unknown op" }, 400);
};
