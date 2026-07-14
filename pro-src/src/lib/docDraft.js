// Local estimate/invoice drafts — saved on the job before QuickBooks sync.

function hasValidLines(lines) {
  return (lines || []).some((ln) => String(ln?.itemName || "").trim());
}

/** Estimate line items saved on the job but not yet in QuickBooks. */
export function hasEstimateDraft(job) {
  return hasValidLines(job?.estimateLines) && !job?.estimateNo && !job?._estimateConfirmed;
}

/** Invoice line items saved on the job but not yet in QuickBooks. */
export function hasInvoiceDraft(job) {
  return hasValidLines(job?.invoiceLines) && !job?.invoiceNo && !job?._invoiceConfirmed;
}

/** Any estimate on this job — QuickBooks number or local draft. */
export function hasEstimateOnJob(job) {
  return !!(job?.estimateNo || job?._estimateConfirmed || hasEstimateDraft(job));
}

/** Any invoice on this job — QuickBooks number or local draft. */
export function hasInvoiceOnJob(job) {
  return !!(job?.invoiceNo || job?._invoiceConfirmed || hasInvoiceDraft(job));
}

export function isEstimateSynced(job) {
  return !!(job?.estimateNo || job?._estimateConfirmed);
}

export function isInvoiceSynced(job) {
  return !!(job?.invoiceNo || job?._invoiceConfirmed);
}