/**
 * Auto-report create-case / paperwork failures to Israel (troubleshoot + deploy fix).
 * Levi 2026-08-03 — mirrors QBO "Report to developers" but fires without a tap when
 * a new-case submit/queue (or related paperwork) fails.
 */
const REPORTED_KEY = "le-pro-paperwork-fail-reported";
const MAX_SEEN = 80;
const DEDUPE_MS = 30 * 60 * 1000;

const s = (v) => (v == null ? "" : String(v).trim());

export const PAPERWORK_FAIL_TAG = "Levi app troubleshooting";
export const REPORT_PAPERWORK_FAIL_CMD = "report_paperwork_fail";

/** Pure: build command-bus payload for report_paperwork_fail. */
export function buildPaperworkFailPayload({
  kind = "create_case",
  error = "",
  jobId = "",
  paperworkJobId = "",
  customer = "",
  address = "",
  requestType = "",
  phase = "app",
  caseNumber = "",
  extra = "",
  force = false,
  reportedAt = Date.now(),
} = {}) {
  return {
    kind: s(kind) || "create_case",
    error: s(error).slice(0, 500) || "unknown",
    jobId: s(jobId),
    paperworkJobId: s(paperworkJobId),
    customer: s(customer),
    address: s(address),
    requestType: s(requestType),
    phase: s(phase) || "app",
    caseNumber: s(caseNumber),
    extra: s(extra).slice(0, 800),
    force: force === true,
    reportedAt,
    source: "le-pro",
    tag: PAPERWORK_FAIL_TAG,
  };
}

/** Stable dedupe key for a fail (job + paperwork id + error snippet). */
export function paperworkFailDedupeKey(payload = {}) {
  return [
    s(payload.kind) || "create_case",
    s(payload.jobId),
    s(payload.paperworkJobId),
    s(payload.error).slice(0, 100),
  ].join("|");
}

export function loadReportedFails() {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORTED_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw
      .filter((r) => r && r.key && now - Number(r.at || 0) < DEDUPE_MS)
      .slice(-MAX_SEEN);
  } catch {
    return [];
  }
}

export function wasPaperworkFailReported(key, existing = loadReportedFails()) {
  return existing.some((r) => r.key === key);
}

export function markPaperworkFailReported(key, existing = loadReportedFails()) {
  const next = existing.filter((r) => r.key !== key);
  next.push({ key, at: Date.now() });
  try {
    localStorage.setItem(REPORTED_KEY, JSON.stringify(next.slice(-MAX_SEEN)));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Enqueue fail report once per dedupe window.
 * @returns {{ ok: boolean, deduped?: boolean, queued?: boolean, error?: string }}
 */
export async function reportPaperworkFailOnce(
  {
    kind,
    error,
    jobId,
    paperworkJobId,
    customer,
    address,
    requestType,
    phase,
    caseNumber,
    extra,
    force = false,
  } = {},
  enqueue
) {
  const payload = buildPaperworkFailPayload({
    kind,
    error,
    jobId,
    paperworkJobId,
    customer,
    address,
    requestType,
    phase,
    caseNumber,
    extra,
    force,
  });
  const key = paperworkFailDedupeKey(payload);
  if (!force && wasPaperworkFailReported(key)) {
    return { ok: true, deduped: true };
  }
  if (typeof enqueue !== "function") {
    return { ok: false, error: "enqueue_not_wired" };
  }
  try {
    const idk = `report_paperwork_fail|${key.slice(0, 80)}|${Date.now()}`;
    await enqueue(
      REPORT_PAPERWORK_FAIL_CMD,
      jobId || "paperwork-fail",
      payload,
      "deterministic",
      idk
    );
    markPaperworkFailReported(key);
    return { ok: true, queued: true, payload };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Pull fields from a create-case / paperwork job object for the report. */
export function fieldsFromPaperworkJob(pwJob = {}, job = {}) {
  const payload = pwJob.payload || {};
  const answers = payload.answers || job?.paperwork?.coned?.createCase?.answers || {};
  const prop = payload.property || {};
  return {
    kind: s(pwJob.type) || "create_case",
    error: s(pwJob.error) || s(job?.paperwork?.coned?.createCase?.execution?.error),
    jobId: s(pwJob.jobId) || s(job?.id) || s(payload.jobId),
    paperworkJobId: s(pwJob.id),
    customer:
      s(payload.customerName) ||
      [answers.ownerFirst, answers.ownerLast].filter(Boolean).join(" ") ||
      s(job?.customerName) ||
      s(job?.customer),
    address:
      s(prop.serviceAddress) ||
      s(answers.serviceAddress) ||
      s(payload.displayServiceAddress) ||
      s(job?.serviceAddress) ||
      s(job?.address),
    requestType:
      s(payload.requestTypePortal) ||
      s(payload.requestType) ||
      s(answers.requestType),
    caseNumber: s(pwJob.caseNumber) || s(payload.caseNumber) || s(job?.paperwork?.coned?.caseNumber),
  };
}
