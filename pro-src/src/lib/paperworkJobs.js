/**
 * Client for the paperwork-jobs bridge (app <-> fleet browser agent).
 *
 * The app creates jobs (Submit a Case -> create_case, status queued), shows
 * their lifecycle, and carries Levi's RED LINE: a case parked at
 * awaiting_approval renders the fleet's pre-submit screenshot and only an
 * explicit Approve here lets the fleet click Submit (server-enforced too).
 */
import { functionsBase } from "./functionsBase.js";
import { authHeader } from "./session.js";

const s = (v) => (v == null ? "" : String(v).trim());

export const PAPERWORK_JOB_STATUS_LABELS = {
  queued: "Queued",
  in_progress: "Running",
  awaiting_approval: "Awaiting your approval",
  approved: "Approved — submitting",
  rejected: "Rejected",
  submitted: "Submitted",
  done: "Done",
  failed: "Failed",
};

export const ACTIVE_PAPERWORK_JOB_STATUSES = new Set([
  "queued",
  "in_progress",
  "awaiting_approval",
  "approved",
]);

export function paperworkJobStatusLabel(status) {
  return PAPERWORK_JOB_STATUS_LABELS[status] || s(status);
}

/** Tailwind tone classes for the lifecycle chip. */
export function paperworkJobStatusTone(status) {
  if (status === "awaiting_approval") return "bg-red-100 text-red-800";
  if (status === "failed" || status === "rejected") return "bg-red-50 text-red-700 border border-red-200";
  if (status === "submitted" || status === "done") return "bg-emerald-100 text-emerald-800";
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "in_progress") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

async function call(body, { base = functionsBase } = {}) {
  try {
    const res = await fetch(`${base()}/paperwork-jobs`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `paperwork-jobs HTTP ${res.status}`, job: data.job };
    }
    return data;
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** App trigger: write a queued paperwork job (create_case etc.). */
export function createPaperworkJob({ type = "create_case", jobId, payload, tenant } = {}, opts) {
  return call({ op: "create", type, jobId: s(jobId), payload, tenant }, opts);
}

export function listPaperworkJobsServer({ jobId, status, type, limit, includeDismissed } = {}, opts) {
  return call(
    {
      op: "list",
      jobId: s(jobId),
      status: s(status),
      type: s(type),
      limit,
      includeDismissed: includeDismissed === true,
    },
    opts
  );
}

export function getPaperworkJob(id, opts) {
  return call({ op: "get", id: s(id) }, opts);
}

/** Hide one finished / bad practice run from the Permits board. */
export function dismissPaperworkJob(id, opts) {
  return call({ op: "dismiss", id: s(id) }, opts);
}

/**
 * Clean slate — dismiss terminal runs (failed/rejected/done/submitted by default)
 * so the Case runs list starts fresh. Active work is never cleared.
 */
export function clearPaperworkJobsSlate({ statuses } = {}, opts) {
  return call(
    {
      op: "clear_slate",
      ...(Array.isArray(statuses) && statuses.length ? { statuses } : {}),
    },
    opts
  );
}

/** Levi's decision on the awaiting_approval screenshot. */
export function approvePaperworkJob(id, approve, note = "", opts) {
  return call({ op: "approve", id: s(id), approve: approve === true, note: s(note) }, opts);
}

/** Terminal / practice statuses safe to clear on a clean slate. */
export const TERMINAL_PAPERWORK_JOB_STATUSES = new Set([
  "failed",
  "rejected",
  "done",
  "submitted",
]);

/** Absolute screenshot URL (server stores a relative /docs path). */
export function paperworkScreenshotUrl(job, { base = functionsBase } = {}) {
  const u = s(job?.screenshotUrl);
  if (!u) return "";
  if (/^https?:/i.test(u)) return u;
  if (job?.screenshotKey) return `${base()}/docs?key=${encodeURIComponent(job.screenshotKey)}`;
  // "/.netlify/functions/docs?key=..." -> re-anchor onto the functions base
  const m = u.match(/\/docs\?key=(.+)$/);
  return m ? `${base()}/docs?key=${m[1]}` : u;
}
