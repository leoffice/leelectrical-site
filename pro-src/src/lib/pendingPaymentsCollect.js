// Collect open payment notices (job pending fields + system queue).
// Hot path: must stay O(jobs) — never re-scan every job's payments per notice
// (that froze scroll for ~a minute on ~4k jobs when a payment landed).

/** Statuses that still need Levi to see a card (Levi 2026-08-03 sticky notice). */
export function isOpenPaymentNotice(p) {
  if (!p) return false;
  const s = String(p.status || "pending");
  if (s === "dismissed" || s === "acked") return false;
  // Explicit Approve (incl. reassignment to Sima etc.) always closes — Levi 2026-08-05 bounce bug.
  // Must check before autoApplied sticky, or "approved" + autoApplied keeps popping forever.
  if (s === "approved") return false;
  if (p.ackedAt) return false;
  // Host auto-apply: sticky until Got it / Edit+Approve (status stays auto_applied until then).
  if (p.autoApplied && s === "auto_applied") return true;
  if (s === "pending" || s === "auto_applied" || s === "needs_match") return true;
  return false;
}

/**
 * Lightweight payment-ref harvest — do NOT call normalizePayments here.
 * That allocates new payment objects (and can mint random ids) per job; doing
 * it once per job per notice was the N² freeze.
 */
function paymentRefsOf(job) {
  const refs = [];
  const list = Array.isArray(job?.payments) ? job.payments : null;
  if (list) {
    for (const p of list) {
      if (!p || p._deleted || p.deletedAt) continue;
      const r = String(p.ref || p.confirmationNumber || p.checkNumber || "").trim();
      if (r) refs.push(r);
    }
  }
  const legacy = job?.payment;
  if (legacy && typeof legacy === "object") {
    const r = String(legacy.ref || legacy.confirmationNumber || legacy.checkNumber || "").trim();
    if (r) refs.push(r);
  }
  return refs;
}

/** conf → Set of job ids that already carry that payment ref. */
export function buildPaymentConfIndex(jobs) {
  const index = new Map();
  for (const j of jobs || []) {
    if (!j) continue;
    const id = String(j.id || "");
    if (!id) continue;
    for (const conf of paymentRefsOf(j)) {
      let set = index.get(conf);
      if (!set) {
        set = new Set();
        index.set(conf, set);
      }
      set.add(id);
    }
  }
  return index;
}

/**
 * Conf already recorded on some *other* job (after reassign/approve) — suppress
 * sticky on the wrong job so Marozov doesn't keep popping when Sima already has it.
 * Still shows auto_applied sticky when conf lives on the same suggested job (Got it).
 */
export function noticeConfAlreadyOnOtherJob(p, confIndex) {
  if (!p || !confIndex || !confIndex.size) return false;
  const conf = String(p.confirmationNumber || p.ref || p.checkNumber || "").trim();
  if (!conf) return false;
  const owners = confIndex.get(conf);
  if (!owners || !owners.size) return false;
  const noticeJob = String(p.jobId || "").trim();
  for (const id of owners) {
    if (!noticeJob || id !== noticeJob) return true;
  }
  return false;
}

/**
 * Open payment notices from job pending fields + system queue.
 * Does not apply dismiss/snooze — caller filters those.
 */
export function collectPending(jobs, systemItems = []) {
  const out = [];
  const seen = new Set();
  const confIndex = buildPaymentConfIndex(jobs);
  // id → job for O(1) system-queue job attach (was .find per item).
  const byId = new Map();
  for (const j of jobs || []) {
    if (j?.id != null) byId.set(String(j.id), j);
  }

  for (const j of jobs || []) {
    const p = j?.pendingCheckPayment || j?.pendingZellePayment;
    if (!isOpenPaymentNotice(p)) continue;
    if (noticeConfAlreadyOnOtherJob({ ...p, jobId: j.id }, confIndex)) continue;
    const id = p.id || `${j.id}-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, jobId: j.id, job: j, id });
  }
  for (const p of systemItems || []) {
    if (!isOpenPaymentNotice(p)) continue;
    if (noticeConfAlreadyOnOtherJob(p, confIndex)) continue;
    const id = p.id || `sys-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const job = byId.get(String(p.jobId || "")) || null;
    out.push({ ...p, id, job });
  }
  // Newest first
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}
