// Pure merge logic for the Netlify store model — kept free of the adapter so
// it can be unit-tested and reused by both the adapter and the staged-changes UI.
//
// Model (matches app/sleek.html + netlify/functions/state.mjs):
//   jobsdata.jobs  = base dataset synced from QuickBooks/Calendar
//   state.ov       = { [jobId]: overlayPatch } — user edits, ALWAYS win
//   overlay-only jobs carry _new:true (also local-* ids and address-bearing
//   writes); _deleted hides a job; _archived keeps it around (flagged) so the
//   Archive tab can restore it.
//
// Merge semantics MUST match sleek's merge2(): objects merge recursively,
// arrays and scalars are REPLACED by the patch (the overlay stores the full
// attachments / invoiceHistory list, not deltas).
import { STAGES } from "../lib/stages.js";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Deep merge `patch` into `base` (returns a NEW object; inputs untouched).
 *  Objects merge recursively; arrays and scalars are replaced by the patch. */
export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : clone(patch);
  }
  const out = clone(base);
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (pv === undefined) continue;
    out[k] = isPlainObject(out[k]) && isPlainObject(pv) ? deepMerge(out[k], pv) : clone(pv);
  }
  return out;
}

function clone(v) {
  return v === null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v));
}

const VIEW_STRINGS = [
  "customer",
  "businessName",
  "personName",
  "title",
  "amount",
  "phone",
  "email",
  "address",
  "serviceAddress",
  "billingAddress",
  "apartment",
  "estimateNo",
  "invoiceNo",
  "notes",
  "description",
  "calEventId",
  "qboCustomerId",
  "_sasCallId",
  "_sasRecordingUrl",
];

/**
 * Fill the shape Job detail expects. Only null/undefined are filled — a
 * present amount, payment, or other value is left alone. This is a view
 * helper: do not write the result back into ov or empty strings will clobber
 * QuickBooks base fields.
 */
export function normalizeJob(job) {
  if (!isPlainObject(job)) return job;
  const out = { ...job };
  for (const k of VIEW_STRINGS) {
    if (out[k] == null) out[k] = "";
  }
  if (out.paid == null) out.paid = false;
  if (!Array.isArray(out.attachments)) out.attachments = [];
  if (!Array.isArray(out.invoiceHistory)) out.invoiceHistory = [];
  if (typeof out.followUp === "string") out.followUp = { text: out.followUp, date: "" };
  else if (!isPlainObject(out.followUp)) out.followUp = { text: "", date: "" };
  else {
    out.followUp = {
      ...out.followUp,
      text: out.followUp.text == null ? "" : out.followUp.text,
      date: out.followUp.date == null ? "" : out.followUp.date,
    };
  }
  const hadStatus = isPlainObject(out.status);
  const status = hadStatus ? { ...out.status } : {};
  for (const s of STAGES) {
    status[s] = isPlainObject(status[s]) ? { ...status[s] } : { s: "" };
  }
  if (!hadStatus) status.Lead = { s: "current" };
  out.status = status;
  return out;
}

export function blankJob(id) {
  return normalizeJob({ id, _new: true });
}

function overlayOnlyVisible(id, o) {
  if (!isPlainObject(o) || o._deleted) return false;
  if (o._new) return true;
  if (String(id).startsWith("local-")) return true;
  return String(o.address || o.serviceAddress || "").trim().length > 0;
}

/** Apply one overlay entry to one base job — sleek's merge2 semantics:
 *  objects merge per key, arrays/scalars replaced by the overlay. */
export function applyOverlay(base, ov) {
  if (!ov) return clone(base);
  return deepMerge(base, ov);
}

/** Merge the base jobs list with the ov overlay:
 *  - overlay patches win over base fields
 *  - overlay-only jobs included when _new, when the id is local-*, or when
 *    the patch carries an address (a direct backend write can still open)
 *  - _deleted jobs are dropped; _archived jobs are KEPT (flag intact) so the
 *    UI can offer an Archive view with restore.
 *  Every returned job is normalized so a partial record still renders. */
export function mergeJobs(baseJobs, ov) {
  const overlay = ov || {};
  const deleted = (id) => !!(overlay[id] && overlay[id]._deleted);
  const out = [];
  const seen = new Set();
  for (const b of baseJobs || []) {
    if (!b || !b.id) continue;
    seen.add(b.id);
    if (deleted(b.id)) continue;
    const merged = normalizeJob(applyOverlay(b, overlay[b.id]));
    merged.id = b.id;
    out.push(merged);
  }
  for (const id of Object.keys(overlay)) {
    // Reserved namespace: "_"-prefixed ov keys (e.g. _sasTickets) are app
    // metadata, never jobs — skip them even if they carry _new-looking data.
    if (String(id).charAt(0) === "_") continue;
    const o = overlay[id];
    if (!o || seen.has(id) || !overlayOnlyVisible(id, o) || deleted(id)) continue;
    const j = normalizeJob(applyOverlay(blankJob(id), o));
    j.id = id;
    // Stale-guard keeps overlay-only rows that are marked _new.
    if (!j._new) j._new = true;
    out.push(j);
  }
  return out;
}

/** When state.ov is stale (blob lag), keep local jobs with saved edits but still admit new QBO jobs. */
export function mergeJobsStaleGuard(prevJobs, incomingJobs) {
  const prev = prevJobs || [];
  const incoming = incomingJobs || [];
  const prevById = Object.fromEntries(prev.map((j) => [j.id, j]));
  const incomingIds = new Set(incoming.map((j) => j && j.id).filter(Boolean));
  const merged = incoming.map((j) => (j && prevById[j.id]) || j);
  for (const j of prev) {
    if (j && j.id && !incomingIds.has(j.id) && j._new) merged.push(j);
  }
  return merged;
}
