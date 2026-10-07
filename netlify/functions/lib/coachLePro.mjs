// Coach LE Pro access — scoped read + per-job field edits for the Coach agent.
//
// Route: /api/coach/* (functions/api/coach/[[path]].js). Approved by Levi
// 2026-10-07 2:03 PM ET (via Dispatch).
//
// SECURITY MODEL
// - One Coach-only bearer credential. The server stores ONLY its SHA-256 hex in
//   the Pages secret COACH_LEPRO_TOKEN_SHA256 and compares in constant time.
//   No secret configured -> 503 (fail closed). Missing/other bearer -> 401.
// - Read: jobs (base list + overlay), the overlay itself, and an allowlist of
//   read-only stores. Stores that hold credentials, pay codes or bank numbers
//   (settings, paylinks, agent access) are never served. Token-like fields are
//   redacted.
// - Write: PATCH /api/coach/job/<id> with { patch: {...} } only. Every field must
//   be on ALLOWED_FIELDS; any money, send, delete or unknown field refuses the
//   WHOLE request (nothing written). Bodies carrying `ov` or `op` are refused, so
//   Coach can never post a full overlay or a delete.
// - Merge: the server reads the CURRENT overlay, deep-merges only this job's
//   allowed fields, and writes it back. Other jobs and `_` keys are untouched.
//   A missing/implausibly small overlay read refuses the write (wipe guard).
// - Before Coach's FIRST write the full current overlay is copied to
//   coachlog/snapshot/... with its sha256 (coachlog/snapshot-meta).
// - Every write is logged to coachlog/w/<ms>-<rid> BEFORE the state write
//   (status pending -> applied | failed): actor=coach, job id, field, old -> new,
//   timestamp in ET with offset.
// - The same credential is refused (403) on every other LE Pro endpoint by the
//   Pages adapter (isCoachRequest), so payments, Zelle apply, sends and deletes
//   are blocked server-side for Coach.

import { deepMerge, isPlainObject } from "./ovPatch.mjs";
import { rotateJsonBackup } from "./storage/backup.mjs";

export const STATE_KEY = "ov-v1";
export const JOBS_KEY = "jobsdata-v1";
export const ACTOR = "coach";
export const DEFAULT_MIN_JOB_KEYS = 1000;

export const STAGES = [
  "Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt",
  "Paperwork", "Scheduled", "Done", "Follow-up", "Paid",
];
// Money stages: marking these is recording a payment, which stays with Office.
export const BLOCKED_STAGES = new Set(["Paid", "Deposit Receipt"]);
const STAGE_STATES = new Set(["", "done", "skipped", "current"]);

// Fields Coach may edit on a job. Everything else is refused.
export const ALLOWED_FIELDS = new Set([
  "notes", "followUp", "status",
  "title", "description", "address", "serviceAddress", "apartment",
  "customer", "personName", "businessName", "phone", "email", "billingAddress",
  "clientGroup", "paperwork", "permits", "permitTracker", "permitRenew",
  "conedCaseNumber", "appsExpected", "appsReady",
]);

// Explicit refusal reasons (for clear errors + tests). Anything not allowed and
// not listed here is refused as field_not_allowed.
const PAYMENT_FIELDS = [
  "paid", "payment", "payments", "paymentBaseline", "openBalance", "amountPaid",
  "balanceDue", "pendingZellePayment", "invoiceHistory", "solaCardToken",
  "solaCardMasked", "payCode", "payUrl", "amount", "contractAmount", "invoiceLines",
  "estimateLines", "discount", "discountType", "discountPercent", "discountValue",
  "invoiceNo", "estimateNo", "invoiceProgressBilling", "invoiceProgressPct",
  "excludeFromBalanceDue", "_balanceExempt", "depositPct", "amountWhenBaselined",
  "invoiceQboId", "qboCustomerId", "_invoiceConfirmed", "_estimateConfirmed",
  "changeOrder", "changeOrderLines",
];
const SEND_FIELDS = [
  "invoiceEmailedAt", "invoiceEmailStatus", "_docEmailed", "lastSentDoc",
  "_lastSentAmount", "estimateEmailedAt", "letterDrafts", "invoiceAgentDraft",
  "estimateAgentDraft",
];
const DELETE_FIELDS = ["_deleted", "deletedAt", "_archived", "archivedAt", "archived", "hidden"];
const REFUSE_REASON = new Map([
  ...PAYMENT_FIELDS.map((f) => [f, "payment_forbidden"]),
  ...SEND_FIELDS.map((f) => [f, "send_forbidden"]),
  ...DELETE_FIELDS.map((f) => [f, "delete_forbidden"]),
]);

// Read-only stores Coach may read (KV store name -> served). Never: settings
// (bank/check numbers, signatures), paylinks (pay codes), agent access codes.
export const READ_STORES = new Set([
  "customers", "calendar", "crewtime", "paperwork-jobs", "coned-intake",
  "email-insights", "progress", "devtasks",
]);

const MAX_BODY = 64 * 1024;
const MAX_NOTES = 20000;
const MAX_TEXT = 2000;
const LOG_VALUE_CAP = 4000;
const REDACT_RE = /token|secret|password|apikey|api_key|routing|accountnumber/i;

// ---------------------------------------------------------------- helpers

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function bearer(req) {
  const h = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : "";
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEq(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function configuredHash(env) {
  const h = String((env && env.COACH_LEPRO_TOKEN_SHA256) || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? h : "";
}

/** @returns {Promise<{ok:true}|{ok:false,status:number,error:string}>} */
export async function authorizeCoach(req, env) {
  const want = configuredHash(env);
  if (!want) return { ok: false, status: 503, error: "coach access not configured" };
  const tok = bearer(req);
  if (!tok) return { ok: false, status: 401, error: "unauthenticated" };
  const got = await sha256Hex(tok);
  if (!safeEq(got, want)) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true };
}

/** True when the request carries the Coach credential (used to refuse it elsewhere). */
export async function isCoachRequest(req, env) {
  const want = configuredHash(env);
  if (!want) return false;
  const tok = bearer(req);
  if (!tok) return false;
  return safeEq(await sha256Hex(tok), want);
}

/** ISO timestamp in America/New_York with its offset, e.g. 2026-10-07T14:22:05-04:00 */
export function isoET(ms) {
  const d = new Date(ms);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offMin = Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? "-" : "+";
  const a = Math.abs(offMin);
  const off = `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

function rid() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function redact(v, depth = 0) {
  if (depth > 12 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = REDACT_RE.test(k) ? "[redacted]" : redact(x, depth + 1);
  return out;
}

function capForLog(v) {
  if (v === undefined) return null;
  const s = JSON.stringify(v);
  if (s && s.length > LOG_VALUE_CAP) return { truncated: true, preview: s.slice(0, LOG_VALUE_CAP) };
  return v;
}

function isStr(v, max) {
  return typeof v === "string" && v.length <= max;
}

// --------------------------------------------------------------- validation

/**
 * Validate a Coach patch. Returns { ok:true } or { ok:false, status, error, fields }.
 * Refuses the whole patch if ANY field is not allowed.
 */
export function validatePatch(patch) {
  if (!isPlainObject(patch)) return { ok: false, status: 400, error: "patch must be an object" };
  const keys = Object.keys(patch);
  if (!keys.length) return { ok: false, status: 400, error: "empty patch" };
  const refused = [];
  for (const k of keys) {
    if (!ALLOWED_FIELDS.has(k)) refused.push({ field: k, reason: REFUSE_REASON.get(k) || "field_not_allowed" });
  }
  if (isPlainObject(patch.status)) {
    for (const [stage, v] of Object.entries(patch.status)) {
      if (BLOCKED_STAGES.has(stage)) refused.push({ field: `status.${stage}`, reason: "payment_forbidden" });
      else if (!STAGES.includes(stage)) refused.push({ field: `status.${stage}`, reason: "unknown_stage" });
      else if (!isPlainObject(v) || !Object.keys(v).every((x) => x === "s" || x === "d")
        || (v.s !== undefined && !STAGE_STATES.has(v.s))
        || (v.d !== undefined && v.d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v.d)))) {
        refused.push({ field: `status.${stage}`, reason: "bad_value" });
      }
    }
  } else if ("status" in patch) refused.push({ field: "status", reason: "bad_value" });
  if ("notes" in patch && !isStr(patch.notes, MAX_NOTES)) refused.push({ field: "notes", reason: "bad_value" });
  if ("followUp" in patch && patch.followUp !== null) {
    const f = patch.followUp;
    const okKeys = ["date", "text", "type", "remind"];
    if (!isPlainObject(f) || !Object.keys(f).every((x) => okKeys.includes(x))
      || (f.text !== undefined && !isStr(f.text, MAX_TEXT))
      || (f.type !== undefined && !isStr(f.type, 80))
      || (f.date !== undefined && f.date !== "" && !/^\d{4}-\d{2}-\d{2}/.test(String(f.date)))
      || (f.remind !== undefined && typeof f.remind !== "boolean")) {
      refused.push({ field: "followUp", reason: "bad_value" });
    }
  }
  for (const k of keys) {
    if (["notes", "followUp", "status", "paperwork", "permits", "permitTracker", "permitRenew"].includes(k)) continue;
    if (!ALLOWED_FIELDS.has(k)) continue;
    const v = patch[k];
    if (!(v === null || isStr(v, MAX_TEXT) || typeof v === "number" || typeof v === "boolean")) {
      refused.push({ field: k, reason: "bad_value" });
    }
  }
  if (refused.length) {
    const reasons = new Set(refused.map((r) => r.reason));
    const top = ["delete_forbidden", "payment_forbidden", "send_forbidden"].find((r) => reasons.has(r))
      || refused[0].reason;
    return { ok: false, status: top.endsWith("_forbidden") || top === "field_not_allowed" ? 403 : 400, error: top, fields: refused };
  }
  return { ok: true };
}

/** Flatten a patch into loggable field paths: status.<Stage>, followUp, notes, ... */
function changedPaths(patch) {
  const out = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "status" && isPlainObject(v)) for (const st of Object.keys(v)) out.push(["status", st]);
    else out.push([k]);
  }
  return out;
}

function getPath(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

// --------------------------------------------------------------- data views

function baseJobs(jobsDoc) {
  const jobs = jobsDoc && jobsDoc.jobs;
  if (Array.isArray(jobs)) return jobs;
  if (isPlainObject(jobs)) return Object.values(jobs);
  return [];
}

function findBase(jobsDoc, id) {
  return baseJobs(jobsDoc).find((j) => j && String(j.id) === id) || null;
}

/** Job as the app shows it: base row with the overlay deep-merged on top. */
export function mergedJob(jobsDoc, ov, id) {
  const base = findBase(jobsDoc, id);
  const over = ov && isPlainObject(ov[id]) ? ov[id] : null;
  if (!base && !over) return null;
  return deepMerge(base || { id }, over || {});
}

function compactRow(j) {
  const st = isPlainObject(j.status) ? j.status : {};
  const stage = STAGES.find((s) => !(st[s] && (st[s].s === "done" || st[s].s === "skipped"))) || "Paid";
  return {
    id: j.id, customer: j.customer, title: j.title,
    address: j.serviceAddress || j.address || "", stage,
    followUp: j.followUp || null, amount: j.amount ?? null,
    openBalance: j.openBalance ?? null, paid: !!j.paid,
    deleted: !!j._deleted, archived: !!j._archived,
  };
}

// --------------------------------------------------------------- handler

/**
 * @param {Request} req
 * @param {Record<string, any>} env
 * @param {{ getStore: (name:string)=>any, now?: ()=>number }} deps
 */
export async function handleCoach(req, env, deps) {
  const now = deps.now || (() => Date.now());
  const auth = await authorizeCoach(req, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/coach\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [res, a, b] = parts;
  const method = req.method.toUpperCase();
  const stateStore = deps.getStore("jobstate");
  const jobsStore = deps.getStore("jobsdata");
  const logStore = deps.getStore("coachlog");

  if (method === "GET") {
    if (res === "whoami" || !res) {
      return json({
        ok: true, actor: ACTOR,
        read: ["jobs", "job/<id>", "state", ...[...READ_STORES].map((s) => `store/${s}`), "log"],
        write: { job: [...ALLOWED_FIELDS], blockedStages: [...BLOCKED_STAGES] },
        blocked: ["payments", "zelle apply", "customer/Resend sends", "deletes", "full overlay writes"],
      });
    }
    if (res === "jobs") {
      const [jobsDoc, state] = await Promise.all([
        jobsStore.get(JOBS_KEY, { type: "json" }),
        stateStore.get(STATE_KEY, { type: "json" }),
      ]);
      const ov = (state && state.ov) || {};
      const ids = new Set(baseJobs(jobsDoc).map((j) => String(j.id)));
      for (const k of Object.keys(ov)) if (k.charAt(0) !== "_") ids.add(k);
      const full = url.searchParams.get("full") === "1";
      const q = (url.searchParams.get("q") || "").toLowerCase();
      let rows = [...ids].map((id) => mergedJob(jobsDoc, ov, id)).filter(Boolean);
      if (q) rows = rows.filter((j) => JSON.stringify([j.id, j.customer, j.title, j.address, j.serviceAddress, j.businessName, j.personName]).toLowerCase().includes(q));
      return json({ ok: true, count: rows.length, jobs: rows.map((j) => (full ? redact(j) : compactRow(j))) });
    }
    if (res === "job" && a) {
      const [jobsDoc, state] = await Promise.all([
        jobsStore.get(JOBS_KEY, { type: "json" }),
        stateStore.get(STATE_KEY, { type: "json" }),
      ]);
      const j = mergedJob(jobsDoc, (state && state.ov) || {}, a);
      if (!j) return json({ ok: false, error: "job not found" }, 404);
      return json({ ok: true, job: redact(j) });
    }
    if (res === "state") {
      const state = (await stateStore.get(STATE_KEY, { type: "json" })) || { ov: {}, ts: 0 };
      const { _auditLog, ...rest } = state.ov || {};
      return json({ ok: true, ts: state.ts || 0, ov: redact(rest) });
    }
    if (res === "store" && a) {
      if (!READ_STORES.has(a)) return json({ ok: false, error: "store_not_readable" }, 403);
      const st = deps.getStore(a);
      if (!b) {
        const listed = await st.list();
        return json({ ok: true, store: a, keys: (listed.blobs || []).map((x) => x.key).filter((k) => !/-bak-\d+$/.test(k)) });
      }
      const v = await st.get(b, { type: "json" });
      if (v == null) return json({ ok: false, error: "not found" }, 404);
      return json({ ok: true, store: a, key: b, value: redact(v) });
    }
    if (res === "log") {
      const listed = await logStore.list();
      const keys = (listed.blobs || []).map((x) => x.key).filter((k) => k.startsWith("w/")).sort().reverse();
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const entries = [];
      for (const k of keys.slice(0, limit)) entries.push(await logStore.get(k, { type: "json" }));
      const snapshot = await logStore.get("snapshot-meta", { type: "json" });
      return json({ ok: true, entries, snapshot });
    }
    return json({ ok: false, error: "not found" }, 404);
  }

  if (method === "PATCH" && res === "job" && a) {
    const id = String(a);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "body too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad json" }, 400); }
    if (!isPlainObject(body)) return json({ ok: false, error: "bad body" }, 400);
    if ("ov" in body) return json({ ok: false, error: "full_ov_forbidden" }, 403);
    if ("op" in body) return json({ ok: false, error: body.op === "delete" ? "delete_forbidden" : "op_forbidden" }, 403);
    const extra = Object.keys(body).filter((k) => k !== "patch" && k !== "reason");
    if (extra.length) return json({ ok: false, error: "unexpected_keys", fields: extra }, 400);
    if (id.charAt(0) === "_") {
      return json({ ok: false, error: id === "_pendingPayments" ? "payment_forbidden" : "reserved_key_forbidden" }, 403);
    }
    const v = validatePatch(body.patch);
    if (!v.ok) return json({ ok: false, error: v.error, fields: v.fields }, v.status);
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";

    // Read CURRENT server state (never a client copy).
    const rawState = await stateStore.get(STATE_KEY, { type: "text" });
    let cur = null;
    try { cur = rawState ? JSON.parse(rawState) : null; } catch { cur = null; }
    const ov = cur && isPlainObject(cur.ov) ? cur.ov : null;
    const minKeys = Number(env.COACH_MIN_JOB_KEYS) > 0 ? Number(env.COACH_MIN_JOB_KEYS) : DEFAULT_MIN_JOB_KEYS;
    const jobKeyCount = ov ? Object.keys(ov).filter((k) => k.charAt(0) !== "_").length : 0;
    if (!ov || jobKeyCount < minKeys) {
      return json({ ok: false, error: "state_unavailable_write_refused", jobKeys: jobKeyCount }, 503);
    }
    const jobsDoc = await jobsStore.get(JOBS_KEY, { type: "json" });
    const before = mergedJob(jobsDoc, ov, id);
    if (!before) return json({ ok: false, error: "job not found" }, 404);
    if (before._deleted) return json({ ok: false, error: "job_deleted_edit_refused" }, 409);

    const ts = now();
    // Snapshot the whole overlay once, before Coach's first write.
    let snapshot = await logStore.get("snapshot-meta", { type: "json" });
    if (!snapshot) {
      const sha = await sha256Hex(rawState);
      const key = `snapshot/ov-v1-${ts}`;
      await logStore.set(key, rawState);
      snapshot = { key: `coachlog/${key}`, sha256: sha, bytes: rawState.length, jobKeys: jobKeyCount, at: isoET(ts), atMs: ts };
      await logStore.setJSON("snapshot-meta", snapshot);
    }

    const after = deepMerge(before, body.patch);
    const rows = changedPaths(body.patch).map((p) => ({
      actor: ACTOR, jobId: id, field: p.join("."),
      old: capForLog(getPath(before, p)), new: capForLog(getPath(after, p)),
      at: isoET(ts),
    }));
    const requestId = rid();
    const logKey = `w/${ts}-${requestId}`;
    const entry = { actor: ACTOR, requestId, jobId: id, at: isoET(ts), atMs: ts, reason, status: "pending", rows };
    await logStore.setJSON(logKey, entry); // logged BEFORE the write

    try {
      const nextOv = { ...ov };
      nextOv[id] = deepMerge(ov[id] || {}, body.patch);
      nextOv[id]._savedAt = ts;
      nextOv[id]._coachEditedAt = isoET(ts);
      await rotateJsonBackup(stateStore, STATE_KEY, { ...cur, ov: nextOv, ts });
    } catch (e) {
      await logStore.setJSON(logKey, { ...entry, status: "failed", error: String(e && e.message || e).slice(0, 300) });
      return json({ ok: false, error: "write_failed" }, 500);
    }
    await logStore.setJSON(logKey, { ...entry, status: "applied" });
    return json({ ok: true, jobId: id, ts, log: `coachlog/${logKey}`, rows });
  }

  // Everything else (POST, DELETE, PUT, other paths) is outside Coach scope.
  if (method === "DELETE") return json({ ok: false, error: "delete_forbidden" }, 403);
  return json({ ok: false, error: "forbidden" }, 403);
}
