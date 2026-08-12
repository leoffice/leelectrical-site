// Snapshot of the document the customer actually received.
//
// Bug class (Izzy est #201971, 2026-08-12): app emailed a revised estimate
// ($7,750) but the job face stayed at the previous draft ($8,860). The PDF and
// pay link were correct; only the job store lagged — so the app looked wrong
// and a later resend risked shipping the stale face again.
//
// After every successful estimate/invoice email we stamp lastSentDoc + face
// amount/lines so the job always matches what the customer got.

import { fmt$, parseAmount, todayStr } from "./format.js";
import { linesTotal } from "./qboDoc.js";

/**
 * Slim line copy for history / re-open (no React row ids).
 * @param {object[]} lines
 */
export function slimSentLines(lines) {
  return (lines || []).map((ln) => ({
    itemName: ln?.itemName || ln?.item || "",
    item: ln?.item || ln?.itemName || "",
    description: ln?.description || "",
    qty: ln?.qty != null && ln.qty !== "" ? ln.qty : 1,
    unitPrice: parseAmount(ln?.unitPrice) || parseAmount(ln?.rate) || parseAmount(ln?.amount) || 0,
    rate: parseAmount(ln?.rate) || parseAmount(ln?.unitPrice) || parseAmount(ln?.amount) || 0,
    amount:
      ln?.amount != null && ln.amount !== ""
        ? parseAmount(ln.amount)
        : (parseAmount(ln?.qty) || 1) *
          (parseAmount(ln?.unitPrice) || parseAmount(ln?.rate) || 0),
    progressBilling: !!ln?.progressBilling,
  }));
}

/**
 * Build a job patch that locks the face to what was just emailed.
 *
 * @param {object} job current job (for history merge)
 * @param {{
 *   kind?: "estimate"|"invoice",
 *   amount?: number|string,
 *   lines?: object[],
 *   to?: string,
 *   docNo?: string,
 *   payCode?: string,
 *   kindLabel?: string,
 *   source?: string,
 * }} opts
 */
export function buildLastSentDocPatch(job, opts = {}) {
  const kind = opts.kind === "estimate" ? "estimate" : "invoice";
  const lines = Array.isArray(opts.lines) ? slimSentLines(opts.lines) : null;
  const fromLines = lines && lines.length ? linesTotal(lines) : 0;
  const amountNum =
    parseAmount(opts.amount) ||
    fromLines ||
    parseAmount(job?.amount) ||
    0;
  const amountStr = amountNum > 0 ? fmt$(amountNum) : String(job?.amount || "").trim();
  const docNo = String(
    opts.docNo ||
      (kind === "estimate" ? job?.estimateNo : job?.invoiceNo) ||
      ""
  ).trim();
  const to = String(opts.to || job?.email || "").trim();
  const today = todayStr();
  const kindLabel =
    opts.kindLabel ||
    (kind === "estimate" ? "Estimate" : "Invoice") +
      (docNo ? " #" + docNo : "") +
      " emailed (local PDF)" +
      (amountNum > 0 ? " — " + amountStr : "");

  const histEntry = {
    date: today,
    to,
    kind: kindLabel,
    amount: amountNum || undefined,
    docNo: docNo || undefined,
    source: opts.source || "send",
  };

  const prevHist = Array.isArray(job?.invoiceHistory) ? job.invoiceHistory.slice() : [];
  const hist = prevHist.concat([histEntry]);

  const lastSentDoc = {
    kind,
    docNo,
    amount: amountNum,
    amountStr: amountStr || undefined,
    emailedAt: new Date().toISOString(),
    to,
    payCode: opts.payCode || "",
    lines: lines || undefined,
    source: opts.source || "send",
  };

  const patch = {
    invoiceHistory: hist,
    _docEmailed: true,
    lastSentDoc,
    _lastSentAmount: amountNum || undefined,
  };

  if (kind === "estimate") {
    patch.estimateEmailedAt = today;
    if (amountNum > 0) {
      patch.amount = amountStr;
      patch.contractAmount = amountNum;
    }
    if (lines && lines.length) {
      patch.estimateLines = lines;
    }
  } else {
    patch.invoiceEmailedAt = today;
    if (amountNum > 0) {
      // Pure invoice face = what was emailed. Dual-doc estimate+invoice jobs
      // already use invoice due as amount — same stamp is correct.
      patch.amount = amountStr;
    }
    if (lines && lines.length) {
      patch.invoiceLines = lines;
    }
  }

  return patch;
}

/**
 * True when job face amount disagrees with lastSentDoc (stale draft risk).
 */
export function faceDiffersFromLastSent(job) {
  const sent = parseAmount(job?.lastSentDoc?.amount ?? job?._lastSentAmount);
  if (!(sent > 0)) return false;
  const face = parseAmount(job?.amount);
  if (!(face > 0)) return false;
  return Math.abs(face - sent) > 0.02;
}
