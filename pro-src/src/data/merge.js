// Pure merge logic for the Netlify store model — kept dependency-free so it
// can be unit-tested and reused by both the adapter and the staged-changes UI.
//
// Model (matches app/jobs-beta.html + netlify/functions/state.mjs):
//   jobsdata.jobs  = base dataset synced from QuickBooks/Calendar
//   state.ov       = { [jobId]: overlayPatch } — user edits, ALWAYS win
//   overlay-only jobs carry _new:true; _deleted/_archived hides a job.

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

export function blankJob(id) {
  return {
    id,
    customer: "",
    title: "",
    amount: "",
    phone: "",
    email: "",
    address: "",
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

/** Apply one overlay entry to one base job. Overlay wins field-by-field;
 *  `status` merges per stage; `invoiceHistory` appends (audit trail). */
export function applyOverlay(base, ov) {
  if (!ov) return clone(base);
  const m = clone(base);
  for (const k of Object.keys(ov)) {
    const v = ov[k];
    if (v === undefined) continue;
    if (k === "status" && isPlainObject(v)) {
      m.status = m.status || {};
      for (const stage of Object.keys(v)) m.status[stage] = clone(v[stage]);
    } else if (k === "invoiceHistory" && Array.isArray(v) && Array.isArray(m.invoiceHistory)) {
      m.invoiceHistory = m.invoiceHistory.concat(clone(v));
    } else if (isPlainObject(v) && isPlainObject(m[k])) {
      m[k] = deepMerge(m[k], v);
    } else {
      m[k] = clone(v);
    }
  }
  return m;
}

/** Merge the base jobs list with the ov overlay:
 *  - overlay patches win over base fields
 *  - overlay-only jobs included when _new:true
 *  - jobs with _deleted or _archived are dropped */
export function mergeJobs(baseJobs, ov) {
  const overlay = ov || {};
  const hidden = (id) => {
    const o = overlay[id];
    return !!(o && (o._deleted || o._archived));
  };
  const out = [];
  const seen = new Set();
  for (const b of baseJobs || []) {
    if (!b || !b.id) continue;
    seen.add(b.id);
    if (hidden(b.id)) continue;
    out.push(applyOverlay(b, overlay[b.id]));
  }
  for (const id of Object.keys(overlay)) {
    const o = overlay[id];
    if (!o || seen.has(id) || !o._new || hidden(id)) continue;
    out.push(applyOverlay(blankJob(id), o));
  }
  return out;
}
