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

/**
 * Clear estimate fields from a job (draft or numbered) without deleting the job.
 * App-only — QuickBooks is unchanged.
 */
export function clearEstimatePatch() {
  return {
    estimateNo: "",
    estimateLines: [],
    _estimateConfirmed: false,
    estimateQboId: "",
    estimateSyncedAt: "",
    estimateDocSource: "",
  };
}

/**
 * Clear invoice fields from a job (draft or numbered) without deleting the job.
 * App-only — QuickBooks is unchanged. Payments on the job are left alone.
 */
export function clearInvoicePatch() {
  return {
    invoiceNo: "",
    invoiceLines: [],
    _invoiceConfirmed: false,
    invoiceQboId: "",
    invoiceSyncedAt: "",
    invoiceDocSource: "",
    invoiceProgressBilling: false,
    paid: false,
  };
}

/** Human label for clearing a draft or numbered doc off the job. */
export function clearDocLabel(job, kind) {
  if (kind === "estimate") {
    if (job?.estimateNo) return "estimate #" + job.estimateNo;
    return "estimate draft";
  }
  if (job?.invoiceNo) return "invoice #" + job.invoiceNo;
  return "invoice draft";
}

/** True when the job has something to clear for this doc kind. */
export function canClearDoc(job, kind) {
  if (!job) return false;
  if (kind === "estimate") {
    return !!(
      job.estimateNo ||
      job._estimateConfirmed ||
      (job.estimateLines || []).some((ln) => String(ln?.itemName || "").trim())
    );
  }
  return !!(
    job.invoiceNo ||
    job._invoiceConfirmed ||
    (job.invoiceLines || []).some((ln) => String(ln?.itemName || "").trim())
  );
}