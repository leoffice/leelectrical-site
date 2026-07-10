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