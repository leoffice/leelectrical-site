// Customer-level invoice / estimate / payment lists from board jobs.
import { sortJobs } from "./stages.js";
import { openBalance, invoiceTotal, amountPaid } from "./customers.js";
import { normalizePayments } from "./payments.js";
import { fmt$ } from "./format.js";

/** Jobs with an invoice number, newest first. */
export function invoiceJobs(jobs, { openOnly = false } = {}) {
  let list = (jobs || []).filter((j) => j && !j._archived && !j._deleted && j.invoiceNo);
  if (openOnly) list = list.filter((j) => !j.paid && openBalance(j) > 0.01);
  return sortJobs(list);
}

/** Jobs with an estimate number, newest first. */
export function estimateJobs(jobs, { openOnly = false } = {}) {
  let list = (jobs || []).filter((j) => j && !j._archived && !j._deleted && j.estimateNo);
  if (openOnly) {
    list = list.filter((j) => !j.invoiceNo && !j._estimateConfirmed);
  }
  return sortJobs(list);
}

/** Flat payment rows across customer jobs (newest first). */
export function paymentRows(jobs, { openOnly = false } = {}) {
  const rows = [];
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    if (openOnly && (j.paid || openBalance(j) <= 0.01)) continue;
    for (const p of normalizePayments(j)) {
      rows.push({
        job: j,
        payment: p,
        sortKey: p.date || j.invoiceNo || "",
      });
    }
  }
  rows.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
  return rows;
}

export function invoiceButtonTone(job) {
  const due = openBalance(job);
  if (job.paid || due <= 0.01) return "paid";
  return "open";
}

export function invoiceButtonLabel(job) {
  const no = job.invoiceNo || "—";
  const due = openBalance(job);
  const tone = invoiceButtonTone(job);
  const amt = tone === "paid" ? fmt$(amountPaid(job) || invoiceTotal(job)) : fmt$(due);
  return { no, amt, tone };
}

export function estimateButtonLabel(job) {
  const no = job.estimateNo || "—";
  const linked = job.invoiceNo ? " → Inv #" + job.invoiceNo : "";
  return { no, linked };
}

export function paymentButtonLabel(row) {
  const p = row.payment;
  const inv = row.job.invoiceNo ? "#" + row.job.invoiceNo : row.job.title || "Job";
  return {
    amt: fmt$(p.amount),
    method: p.method || "Payment",
    date: p.date || "",
    inv,
  };
}