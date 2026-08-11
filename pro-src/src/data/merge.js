// Pure merge logic for the Netlify store model — kept dependency-free so it
// can be unit-tested and reused by both the adapter and the staged-changes UI.
//
// Model (matches app/sleek.html + netlify/functions/state.mjs):
//   jobsdata.jobs  = base dataset synced from QuickBooks/Calendar
//   state.ov       = { [jobId]: overlayPatch } — user edits, ALWAYS win
//   overlay-only jobs carry _new:true; _deleted hides a job; _archived keeps
//   it around (flagged) so the Archive tab can restore it.
//   Soft-delete is a TOMBSTONE (deletedAt + _archived), never a hard erase —
//   prior state lives in the universal audit log (ov._auditLog / audit_commands).
//   Reserved "_"-prefixed ov keys are app metadata (e.g. _auditLog, _sasTickets).
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

// Invoice doc-CONTENT fields QuickBooks becomes authoritative on once an invoice
// has been emailed/synced. Never includes payments, balances, status, or
// customer info — those stay owned by the overlay.
const RECONCILE_DOC_FIELDS = [
  "invoiceLines",
  "estimateLines",
  "contractAmount",
  "invoiceProgressPct",
  "invoiceProgressBilling",
];

function docEmailedTs(job) {
  const t = Date.parse((job && job.invoiceEmailedAt) || "");
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Stop a STALE overlay from shadowing fresher QuickBooks data.
 *
 * The overlay normally "always wins" so an edit shows instantly and survives
 * QBO lag. But once QuickBooks has emailed/updated the invoice AFTER the overlay
 * was last saved, the overlay's line items are stale and must yield — otherwise
 * the app keeps snapping an edited invoice back to the pre-sync snapshot (the
 * change-order-that-won't-stick bug on inv #231595: device held a 1-line pre-CO
 * copy while QBO already had the emailed 2-line change order).
 *
 * Only the doc-CONTENT fields are dropped, and only when every guard holds:
 *  - overlay carries its own invoiceLines (a doc edit to weigh),
 *  - base has confirmed invoice lines for the SAME invoice number,
 *  - base was emailed AFTER the overlay's _savedAt (0 for legacy overlays), and
 *  - the content actually differs.
 * A fresh local save stamps _savedAt (see adapter.saveJob), so in-flight and
 * local-only edits are never pruned.
 */
export function reconcileStaleDocOverlay(base, ov) {
  if (!isPlainObject(ov) || !Array.isArray(ov.invoiceLines)) return ov;
  if (!base || !Array.isArray(base.invoiceLines) || !base.invoiceLines.length) return ov;
  if (!base.invoiceNo) return ov;
  if (String(ov.invoiceNo || base.invoiceNo) !== String(base.invoiceNo)) return ov;
  if (docEmailedTs(base) <= Number(ov._savedAt || 0)) return ov;
  if (JSON.stringify(ov.invoiceLines) === JSON.stringify(base.invoiceLines)) return ov;
  const pruned = { ...ov };
  for (const f of RECONCILE_DOC_FIELDS) delete pruned[f];
  return pruned;
}

/**
 * Jobs that must not vanish from soft-delete / mock cleanup (Levi 2026-08-11).
 * Covers: any payment entered, confirmed invoice, and paid city-permit renews
 * (LE-2702 · 40 Hampton — money landed after leftover cleanup).
 * Keep merge.js free of permitRenewal imports — mirror money + renew signals.
 */
function isMoneyOrInvoiceKeepVisible(o) {
  if (!o || typeof o !== "object") return false;
  // Any real payment on the job
  const pays = Array.isArray(o.payments) ? o.payments : [];
  for (const p of pays) {
    if (!p || p._deleted || p.deletedAt) continue;
    const n = Number(String(p?.amount ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n) && n > 0.009) return true;
  }
  if (o.paid) return true;
  // Confirmed / numbered invoice or estimate — do not vanish after entry
  const inv = String(o.invoiceNo || "").trim();
  const est = String(o.estimateNo || "").trim();
  if (inv && (o._invoiceConfirmed || o._docEmailed || o.invoiceEmailedAt || o.paid)) {
    return true;
  }
  if (est && (o._estimateConfirmed || o._docEmailed || o.estimateEmailedAt)) {
    return true;
  }
  // Paid / queued city-permit renew
  const pr = o.permitRenew || o.permitRenewMock || {};
  const title = String(o.title || "").toLowerCase();
  const isRenew =
    !!(
      pr.mock ||
      pr.realTest ||
      pr.noticeOnly ||
      pr.scenarioId ||
      pr.placeholderInvoiceNo ||
      pr.cta ||
      pr.provisional ||
      pr.invoiceMaterialized ||
      pr.phase === "A" ||
      pr.phase === "real" ||
      pr.phase === 1 ||
      pr.nextStep === "update_permit" ||
      pr.queueUpdatePermit ||
      pr.deployUpdate ||
      pr.paid
    ) ||
    title.includes("permit renew") ||
    title.includes("permit renewal");
  if (!isRenew) return false;
  if (pr.paid) return true;
  if (pr.nextStep === "update_permit" || pr.queueUpdatePermit || pr.deployUpdate) {
    return true;
  }
  return false;
}

/** @deprecated name kept for call-site clarity — paid renew is a subset */
function isPaidPermitRenewKeepVisible(o) {
  return isMoneyOrInvoiceKeepVisible(o);
}

/** Merge the base jobs list with the ov overlay:
 *  - overlay patches win over base fields
 *  - overlay-only jobs included when _new:true
 *  - _deleted jobs are dropped; _archived jobs are KEPT (flag intact) so the
 *    UI can offer an Archive view with restore.
 *  - Exception (Levi 2026-08-11): payment / confirmed invoice / paid renew
 *    stay visible even if `_deleted` — money & invoices must not vanish. */
export function mergeJobs(baseJobs, ov) {
  const overlay = ov || {};
  const hardDeleted = (id) => {
    const o = overlay[id];
    if (!o || !o._deleted) return false;
    // Money / invoice always wins over soft-delete
    if (isMoneyOrInvoiceKeepVisible(o)) return false;
    return true;
  };
  const out = [];
  const seen = new Set();
  for (const b of baseJobs || []) {
    if (!b || !b.id) continue;
    seen.add(b.id);
    if (hardDeleted(b.id)) continue;
    const merged = applyOverlay(b, reconcileStaleDocOverlay(b, overlay[b.id]));
    const keep =
      isMoneyOrInvoiceKeepVisible(overlay[b.id] || {}) || isMoneyOrInvoiceKeepVisible(merged);
    if ((overlay[b.id]?._deleted || merged._deleted) && keep) {
      merged._deleted = false;
      merged._archived = false;
      if (merged.deletedAt) merged.deletedAt = "";
    }
    out.push(merged);
  }
  for (const id of Object.keys(overlay)) {
    // Reserved namespace: "_"-prefixed ov keys (e.g. _sasTickets) are app
    // metadata, never jobs — skip them even if they carry _new-looking data.
    if (String(id).charAt(0) === "_") continue;
    const o = overlay[id];
    if (!o || seen.has(id) || hardDeleted(id)) continue;
    // Overlay-only rows need _new. Exception: local-* jobs can lose _new when a
    // thin create_customer patch (qboCustomerId only) races ahead of the first
    // full save — still surface them so the customer doesn't vanish.
    // Money / invoices also surface without _new (deleted-then-paid race).
    const isLocalId = String(id).startsWith("local-");
    const keepMoney = isMoneyOrInvoiceKeepVisible(o);
    if (!o._new && !isLocalId && !keepMoney) continue;
    if (!o._new && isLocalId && !keepMoney) {
      const hasSignal =
        o.customer ||
        o.businessName ||
        o.qboCustomerId ||
        o.title ||
        o.invoiceNo ||
        o.estimateNo;
      if (!hasSignal) continue;
    }
    const j = applyOverlay(blankJob(id), o);
    j.id = id;
    // Recover visibility flag so later thin patches don't drop the row again.
    if (isLocalId && !j._new) j._new = true;
    if ((o._deleted || j._deleted) && keepMoney) {
      j._deleted = false;
      j._archived = false;
      j.deletedAt = "";
    }
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
