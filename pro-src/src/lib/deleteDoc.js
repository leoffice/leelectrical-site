// Soft-delete helpers — dashboard only, never touches QuickBooks.
import { clientKey, jobsForCustomerKey } from "./customers.js";

/** Overlay patch to hide a job from the dashboard. */
export function deleteJobPatch() {
  return { _deleted: true };
}

/** Job ids for every active job under a customer board key. */
export function jobIdsForCustomer(jobs, customerKey) {
  return jobsForCustomerKey(jobs, customerKey)
    .filter((j) => j && !j._deleted)
    .map((j) => j.id);
}

/** True when this job row represents an invoice or estimate doc. */
export function isDocJob(job) {
  if (!job) return false;
  return !!(job.invoiceNo || job.estimateNo);
}

/** Short label for a delete confirm sheet. */
export function deleteDocLabel(job) {
  if (!job) return "this job";
  if (job.invoiceNo) return "invoice #" + job.invoiceNo;
  if (job.estimateNo) return "estimate #" + job.estimateNo;
  return job.title || job.customer || "this job";
}

function hasLines(lines) {
  return (lines || []).some((ln) => String(ln?.itemName || "").trim());
}

/** A document saved on the job but never sent to QuickBooks. */
export function isDocDraft(job, kind) {
  if (!job) return false;
  return kind === "estimate"
    ? !job.estimateNo && !job._estimateConfirmed && hasLines(job.estimateLines)
    : !job.invoiceNo && !job._invoiceConfirmed && hasLines(job.invoiceLines);
}

/** Is there a document of the OTHER kind on this same job row? */
export function jobHasOtherDoc(job, kind) {
  if (!job) return false;
  return kind === "estimate"
    ? !!(job.invoiceNo || job._invoiceConfirmed || hasLines(job.invoiceLines))
    : !!(job.estimateNo || job._estimateConfirmed || hasLines(job.estimateLines));
}

/**
 * How deleting one document should be carried out (Levi 2026-07-28).
 *
 * A document IS a job row in this model, so "delete the invoice" usually means
 * dropping the row — but not when the same row also carries the estimate, or we
 * would silently take the estimate with it. In that case only the invoice's own
 * fields are cleared and the row survives.
 *
 * QuickBooks is never touched either way; a synced document keeps existing there
 * and the confirm copy has to say so.
 *
 * @param {object} job
 * @param {"invoice"|"estimate"} kind
 * @returns {{ mode: "draft"|"fields"|"row", patch: object, syncedNo: string, warnsQuickbooks: boolean }}
 */
export function removeDocPlan(job, kind) {
  const isEstimate = kind === "estimate";
  const no = String((isEstimate ? job?.estimateNo : job?.invoiceNo) || "").trim();
  const draft = isDocDraft(job, kind);
  const clearFields = isEstimate
    ? { estimateNo: "", estimateLines: [], _estimateConfirmed: false }
    : { invoiceNo: "", invoiceLines: [], _invoiceConfirmed: false, invoiceAgentDraft: null };

  // Never-synced draft: drop the saved lines, keep the row and its other doc.
  if (draft) {
    return { mode: "draft", patch: clearFields, syncedNo: "", warnsQuickbooks: false };
  }
  // The row carries the other document too — clear only this one.
  if (jobHasOtherDoc(job, kind)) {
    return { mode: "fields", patch: clearFields, syncedNo: no, warnsQuickbooks: !!no };
  }
  // Nothing else on the row — remove it from the board.
  return { mode: "row", patch: deleteJobPatch(), syncedNo: no, warnsQuickbooks: !!no };
}

/** Confirm-sheet copy for removeDocPlan. */
export function removeDocCopy(job, kind, plan = removeDocPlan(job, kind)) {
  const word = kind === "estimate" ? "estimate" : "invoice";
  if (plan.mode === "draft") {
    return {
      title: `Delete this draft ${word}?`,
      body: `The ${word} lines saved on this job are removed. Nothing was ever sent to QuickBooks, so there is nothing to undo there.`,
      confirm: `Delete draft ${word}`,
    };
  }
  const numbered = plan.syncedNo ? `${word} #${plan.syncedNo}` : `this ${word}`;
  return {
    title: `Remove ${numbered}?`,
    body:
      `It comes off your board here. **QuickBooks is not changed** — if you want it gone there too, void or delete it in QuickBooks.` +
      (plan.mode === "fields"
        ? ` The other document on this job stays.`
        : ` This job row goes with it.`),
    confirm: `Remove ${numbered}`,
  };
}