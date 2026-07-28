// Unlinked payments + best invoice suggestion for "Apply to invoice #…".
import { openBalance } from "./customers.js";
import { parseAmount } from "./format.js";
import { payTargetsForCustomerPick } from "./customerDocLists.js";
import { serviceAddressDisplay } from "./customerSync.js";

/**
 * A payment is unlinked when its job has no real invoice number (and no
 * linked-invoice pointer). Orphan Zelle/check rows sit here until applied.
 */
export function isPaymentUnlinked(job, payment) {
  void payment;
  if (!job) return true;
  const inv = String(job.invoiceNo || "").trim();
  const linked = String(job.linkedInvoiceNo || "").trim();
  return !inv && !linked;
}

/** Invoice # shown on a payment row once linked (own job or linked pointer). */
export function paymentInvoiceDocNo(job, payment) {
  void payment;
  return (
    String(job?.invoiceNo || "").trim() ||
    String(job?.linkedInvoiceNo || "").trim() ||
    ""
  );
}

function addrKey(job) {
  return String(serviceAddressDisplay(job) || job?.serviceAddress || job?.address || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Best invoice (or convert-ready estimate) to apply this payment to.
 * Prefers same customer + same service address + open balance that fits amount.
 * Returns { job, kind, docNo, label } or null.
 */
export function suggestInvoiceForPayment(jobs, sourceJob, payment) {
  const name = sourceJob?.customer || sourceJob?.businessName || "";
  if (!name) return null;
  const preferAddress = sourceJob?.serviceAddress || sourceJob?.address || "";
  const targets = payTargetsForCustomerPick(jobs || [], name, {
    includeJobId: sourceJob?.id || "",
    preferAddress,
    openOnlyInvoices: false,
  });
  // Only suggest real invoices for the one-tap apply button (estimates need convert).
  const invoices = targets.filter((t) => t.kind === "invoice" && t.job?.invoiceNo);
  if (!invoices.length) {
    // Fall back to first convert-ready estimate at this address.
    const est = targets.find((t) => t.kind === "estimate" && t.job);
    if (!est) return null;
    return {
      job: est.job,
      kind: "estimate",
      docNo: String(est.job.estimateNo || "").trim(),
      label: est.job.estimateNo
        ? "Convert Est #" + est.job.estimateNo + " then apply"
        : "Convert estimate then apply",
    };
  }

  const payAmt = parseAmount(payment?.amount);
  const srcAddr = addrKey(sourceJob);
  const scored = invoices.map((t) => {
    const j = t.job;
    let score = 0;
    const due = openBalance(j);
    if (srcAddr && addrKey(j) === srcAddr) score += 50;
    if (due > 0.01) score += 20;
    if (payAmt > 0 && due > 0) {
      const gap = Math.abs(due - payAmt);
      if (gap < 0.02) score += 40;
      else if (gap / Math.max(due, payAmt) < 0.05) score += 25;
      else if (payAmt <= due + 0.02) score += 10;
    }
    // Prefer newer / higher doc numbers slightly
    const n = parseInt(String(j.invoiceNo).replace(/\D/g, ""), 10) || 0;
    score += Math.min(n % 1000, 9) * 0.01;
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.t;
  if (!best?.job?.invoiceNo) return null;
  return {
    job: best.job,
    kind: "invoice",
    docNo: String(best.job.invoiceNo),
    label: "Apply to invoice #" + best.job.invoiceNo,
  };
}
