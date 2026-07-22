// Pure merge logic for the Netlify store model — kept dependency-free so it
// can be unit-tested and reused by both the adapter and the staged-changes UI.
//
// Model (matches app/sleek.html + netlify/functions/state.mjs):
//   jobsdata.jobs  = base dataset synced from QuickBooks/Calendar
//   state.ov       = { [jobId]: overlayPatch } — user edits, ALWAYS win
//   overlay-only jobs carry _new:true; _deleted hides a job; _archived keeps
//   it around (flagged) so the Archive tab can restore it.
//
// Merge semantics MUST match sleek's merge2(): objects merge recursively,
// arrays and scalars are REPLACED by the patch (the overlay stores the full
// attachments / invoiceHistory list, not deltas).

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

// Prefer structuredClone when available (faster than JSON round-trip on large jobs).
function clone(v) {
  if (v === null || typeof v !== "object") return v;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(v);
    } catch {
      /* fall through for non-cloneable values */
    }
  }
  return JSON.parse(JSON.stringify(v));
}

export function blankJob(id) {
  return {
    id,
    customer: "",
    businessName: "",
    personName: "",
    title: "",
    amount: "",
    phone: "",
    email: "",
    address: "",
    serviceAddress: "",
    billingAddress: "",
    apartment: "",
    estimateNo: "",
    invoiceNo: "",
    paid: false,
    notes: "",
    attachments: [],
    invoiceHistory: [],
    followUp: null,
    calEventId: "",
    status: { Lead: { s: "current" } },
  };
}

/** Apply one overlay entry to one base job — sleek's merge2 semantics:
 *  objects merge per key, arrays/scalars replaced by the overlay. */
export function applyOverlay(base, ov) {
  if (!ov || (typeof ov === "object" && !Object.keys(ov).length)) return base;
  return deepMerge(base, ov);
}

/** Merge the base jobs list with the ov overlay:
 *  - overlay patches win over base fields
 *  - overlay-only jobs included when _new:true
 *  - _deleted jobs are dropped; _archived jobs are KEPT (flag intact) so the
 *    UI can offer an Archive view with restore. */
export function mergeJobs(baseJobs, ov) {
  const overlay = ov || {};
  const deleted = (id) => !!(overlay[id] && overlay[id]._deleted);
  const out = [];
  const seen = new Set();
  for (const b of baseJobs || []) {
    if (!b || !b.id) continue;
    seen.add(b.id);
    if (deleted(b.id)) continue;
    out.push(applyOverlay(b, overlay[b.id]));
  }
  for (const id of Object.keys(overlay)) {
    // Reserved namespace: "_"-prefixed ov keys (e.g. _sasTickets) are app
    // metadata, never jobs — skip them even if they carry _new-looking data.
    if (String(id).charAt(0) === "_") continue;
    const o = overlay[id];
    if (!o || seen.has(id) || !o._new || deleted(id)) continue;
    const j = applyOverlay(blankJob(id), o);
    j.id = id;
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
