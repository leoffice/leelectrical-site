/* Data-integrity invariants for the job ↔ invoice ↔ payment graph.
 *
 * Written after the 2026-07-20 incident: commit 7d07565 keyed QBO payments as
 * "qbo-" + paymentId, which is the SAME namespace as job ids ("qbo-" + invoice
 * DocNumber). Both are small integers in the same range, so 537 payments
 * collided with unrelated invoices and the payment→invoice wire came apart.
 *
 * These checks are pure and dependency-free so the client, the write path in
 * netlify/functions/jobsdata.mjs, and the scheduled alerter can all share them.
 */

/** Max invoices/estimates a single user action may create. More than this is
 *  assumed to be runaway auto-generation, not intent. */
export const AUTOGEN_TRIPWIRE = 3;

const isJobNs = (id) => /^qbo-/.test(String(id || ""));
const isPayNs = (id) => /^(qbopay-|sola-)/.test(String(id || ""));

function paymentsOf(job) {
  return Array.isArray(job?.payments) ? job.payments : [];
}

/**
 * INVARIANT 1 — job ids and payment ids never intersect.
 * This is the check that catches the 2026-07-20 regression at the source.
 */
export function checkIdNamespaces(jobs) {
  const problems = [];
  const jobIds = new Set((jobs || []).map((j) => j.id));
  for (const job of jobs || []) {
    if (isPayNs(job.id)) {
      problems.push({ kind: "job_in_payment_namespace", jobId: job.id });
    }
    for (const p of paymentsOf(job)) {
      if (isJobNs(p.id)) {
        problems.push({
          kind: "payment_in_job_namespace",
          paymentId: p.id,
          hostJobId: job.id,
          collidesWith: jobIds.has(p.id) ? p.id : null,
        });
      }
    }
  }
  return problems;
}

/**
 * INVARIANT 2 — every payment names the invoice it belongs to, and that
 * back-reference matches the job it is nested under. A payment must attach to
 * an existing invoice; it must never stand alone or point elsewhere.
 */
export function checkPaymentLinkage(jobs) {
  const problems = [];
  const byId = new Map((jobs || []).map((j) => [j.id, j]));
  for (const job of jobs || []) {
    for (const p of paymentsOf(job)) {
      if (!p.jobId && !p.invoiceNo) {
        problems.push({ kind: "payment_unlinked", paymentId: p.id, hostJobId: job.id });
        continue;
      }
      if (p.jobId && p.jobId !== job.id) {
        problems.push({
          kind: "payment_points_elsewhere",
          paymentId: p.id,
          hostJobId: job.id,
          claims: p.jobId,
          claimExists: byId.has(p.jobId),
        });
      }
      if (p.invoiceNo && job.invoiceNo && String(p.invoiceNo) !== String(job.invoiceNo)) {
        problems.push({
          kind: "payment_invoice_mismatch",
          paymentId: p.id,
          hostJobId: job.id,
          claims: p.invoiceNo,
          actual: job.invoiceNo,
        });
      }
    }
  }
  return problems;
}

/**
 * INVARIANT 3 — one document number, one job. Catches an invoice's line items
 * fanning out into multiple jobs, and duplicate auto-created invoices.
 */
export function checkDocUniqueness(jobs) {
  const problems = [];
  for (const field of ["invoiceNo", "estimateNo"]) {
    const seen = new Map();
    for (const job of jobs || []) {
      const no = String(job[field] || "").trim();
      if (!no) continue;
      if (!seen.has(no)) seen.set(no, []);
      seen.get(no).push(job.id);
    }
    for (const [no, ids] of seen) {
      if (ids.length > 1) problems.push({ kind: "duplicate_" + field, docNo: no, jobIds: ids });
    }
  }
  const ids = new Map();
  for (const job of jobs || []) ids.set(job.id, (ids.get(job.id) || 0) + 1);
  for (const [id, n] of ids) {
    if (n > 1) problems.push({ kind: "duplicate_job_id", jobId: id, count: n });
  }
  return problems;
}

/**
 * TRIPWIRE — reject a write that creates more than AUTOGEN_TRIPWIRE new
 * invoices/estimates at once. "One transaction → one estimate" is the rule;
 * this is the backstop that fires when something fans out instead.
 */
export function checkAutogenTripwire(prevJobs, nextJobs, limit = AUTOGEN_TRIPWIRE) {
  const before = new Set((prevJobs || []).map((j) => j.id));
  const added = (nextJobs || []).filter((j) => !before.has(j.id));
  const withDoc = added.filter((j) => String(j.invoiceNo || j.estimateNo || "").trim());
  if (withDoc.length > limit) {
    return [{
      kind: "autogen_tripwire",
      created: withDoc.length,
      limit,
      jobIds: withDoc.map((j) => j.id).slice(0, 25),
    }];
  }
  return [];
}

/** Run every invariant. Returns [] when the dataset is healthy. */
export function auditJobs(jobs) {
  return [
    ...checkIdNamespaces(jobs),
    ...checkPaymentLinkage(jobs),
    ...checkDocUniqueness(jobs),
  ];
}

/** Full pre-write gate: invariants on the result + the fan-out tripwire. */
export function auditWrite(prevJobs, nextJobs, opts = {}) {
  return [
    ...auditJobs(nextJobs),
    ...checkAutogenTripwire(prevJobs, nextJobs, opts.limit),
  ];
}

/** One-line-per-problem summary for logs and alert emails. */
export function formatProblems(problems) {
  const counts = {};
  for (const p of problems || []) counts[p.kind] = (counts[p.kind] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind}: ${n}`)
    .join("\n");
}
