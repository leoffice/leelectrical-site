// Client helpers for the public estimate View-and-Approve landing page.

import { parseAmount, fmt$ } from "./format.js";
import { functionsBase } from "./functionsBase.js";
import { progressBillLines } from "./progressBilling.js";
import { lineAmount, linesTotal } from "./qboDoc.js";
import { buildEstimatePdfFromJob, buildInvoicePdfFromJob } from "./invoicePdf.js";

export function isEstimateLanding(data) {
  if (!data) return false;
  if (data.k === "e" || data.kind === "estimate") return true;
  return Array.isArray(data.lines) && data.lines.length > 0 && !data.pay;
}

export function estimateDocNo(data) {
  return String(data?.en || data?.i || "").trim();
}

/**
 * Map public estimate landing payload → job shape for client PDF.
 * Used when docs store has no est-{no} yet (test links, or send-time upload miss).
 */
export function buildEstimateJobFromPayload(data) {
  const estNo = estimateDocNo(data);
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const total =
    lines.length > 0
      ? lines.reduce((s, ln) => s + lineAmount(ln), 0)
      : parseAmount(data?.a) || parseAmount(String(data?.t || "").replace(/[$,]/g, "")) || 0;
  return {
    id: String(data?.j || "").trim(),
    customer: String(data?.c || "").trim(),
    businessName: String(data?.businessName || data?.c || "").trim(),
    personName: String(data?.personName || "").trim(),
    qboCustomerId: String(data?.qboCustomerId || "").trim(),
    email: String(data?.e || "").trim(),
    phone: String(data?.ph || "").trim(),
    title: String(data?.w || "Electrical services").trim(),
    serviceAddress: String(data?.sa || "").trim(),
    billingAddress: String(data?.ba || data?.sa || "").trim(),
    address: String(data?.sa || data?.ba || "").trim(),
    apartment: String(data?.apartment || "").trim(),
    zip: String(data?.z || "").trim(),
    estimateNo: estNo,
    estimateLines: lines.length
      ? lines
      : total > 0
        ? [{ itemName: "Electrical services", description: String(data?.w || "").trim(), qty: 1, unitPrice: total }]
        : [],
    amount: total,
    openBalance: total,
    payments: [],
  };
}

/** Build estimate PDF blob from landing payload (client qb-pdf). */
export function buildEstimatePdfBlobFromPayload(data) {
  const job = buildEstimateJobFromPayload(data);
  if (!job.estimateNo && !job.estimateLines?.length && !(job.amount > 0)) {
    return { ok: false, error: "no_data", job };
  }
  const blob = buildEstimatePdfFromJob(job);
  if (!blob) return { ok: false, error: "no_pdf", job };
  return { ok: true, blob, job };
}

export function depositPctFromPayload(data) {
  const n = parseAmount(data?.dp);
  return n > 0 && n <= 100 ? n : 50;
}

export function depositAmountFromPayload(data, pct) {
  const p = pct != null ? pct : depositPctFromPayload(data);
  if (Array.isArray(data?.lines) && data.lines.length) {
    const lines = progressBillLines(data.lines, p);
    return lines.reduce((s, ln) => s + lineAmount(ln), 0);
  }
  const total = parseAmount(data?.a) || parseAmount(String(data?.t || "").replace(/[$,]/g, ""));
  return Math.round(total * (p / 100) * 100) / 100;
}

export function buildDepositInvoiceJob(data, { depositPct, invoiceNo } = {}) {
  const pct = depositPct != null ? depositPct : depositPctFromPayload(data);
  const estNo = estimateDocNo(data);
  const invNo = String(invoiceNo || `D-${estNo || Date.now().toString().slice(-8)}`).trim();
  const lines = progressBillLines(data?.lines || [], pct);
  const total = lines.reduce((s, ln) => s + lineAmount(ln), 0);
  return {
    id: String(data?.j || "").trim(),
    customer: String(data?.c || "").trim(),
    businessName: String(data?.businessName || data?.c || "").trim(),
    personName: String(data?.personName || "").trim(),
    qboCustomerId: String(data?.qboCustomerId || "").trim(),
    email: String(data?.e || "").trim(),
    phone: String(data?.ph || "").trim(),
    title: String(data?.w || "Electrical services").trim(),
    serviceAddress: String(data?.sa || "").trim(),
    billingAddress: String(data?.ba || data?.sa || "").trim(),
    address: String(data?.sa || data?.ba || "").trim(),
    apartment: String(data?.apartment || "").trim(),
    zip: String(data?.z || "").trim(),
    estimateNo: estNo,
    invoiceNo: invNo,
    estimateLines: data?.lines || [],
    invoiceLines: lines,
    amount: total,
    openBalance: total,
    payments: [],
  };
}

export async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Build deposit invoice PDF (client qb-pdf) for the estimate-action API. */
export async function buildDepositInvoicePdfB64(data, opts = {}) {
  const job = buildDepositInvoiceJob(data, opts);
  const blob = buildInvoicePdfFromJob(job);
  if (!blob) return { ok: false, error: "no_pdf", job };
  const pdfB64 = await blobToBase64(blob);
  return { ok: true, pdfB64, job, invoiceNo: job.invoiceNo, amount: job.amount };
}

export async function postEstimateAction({ code, action, pdfB64, invoiceNo, depositPct, officeOnly }) {
  const res = await fetch(`${functionsBase()}/estimate-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      action,
      pdfB64: pdfB64 || undefined,
      invoiceNo: invoiceNo || undefined,
      depositPct: depositPct != null ? depositPct : undefined,
      officeOnly: !!officeOnly,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export function formatDepositCta(amount, pct = 50) {
  const a = typeof amount === "number" ? amount : parseAmount(amount);
  if (a > 0) return `Generate Invoice with ${pct}% Deposit (${fmt$(a)})`;
  return `Generate Invoice with ${pct}% Deposit`;
}

// re-export for tests
export { linesTotal, progressBillLines };
