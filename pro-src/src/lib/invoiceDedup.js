// Duplicate invoice detection — two active jobs sharing the same invoice #.
//
//   findDuplicateInvoiceSuggestion(jobs) -> first non-dismissed pair
//   dismissInvoicePair / isInvoiceDismissed -> lepro_noinvdedup memory

import { boardCustomerLabel, fmtAmountDue } from "./customers.js";

const NOINV_KEY = "lepro_noinvdedup";

export function invoicePairId(no, idA, idB) {
  const inv = String(no || "").trim();
  const ids = [String(idA), String(idB)].sort();
  return inv + "|" + ids.join("|");
}

export function loadInvoiceDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(NOINV_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isInvoiceDismissed(no, idA, idB) {
  return loadInvoiceDismissed().includes(invoicePairId(no, idA, idB));
}

export function dismissInvoicePair(no, idA, idB) {
  const list = loadInvoiceDismissed();
  const id = invoicePairId(no, idA, idB);
  if (!list.includes(id)) {
    list.push(id);
    try {
      localStorage.setItem(NOINV_KEY, JSON.stringify(list));
    } catch {}
  }
}

/** Pick the job to keep when merging — prefer more payment history / QBO link. */
export function pickKeeperJob(a, b) {
  const score = (j) => {
    let s = 0;
    if (j.qboCustomerId) s += 4;
    if (j.paid) s += 2;
    if (j.payment || (j.payments && j.payments.length)) s += 3;
    if (j.calEventId) s += 1;
    if (j.notes) s += 1;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function jobSummary(job, jobs) {
  const parts = [];
  const cust = boardCustomerLabel(job, jobs);
  if (cust) parts.push(cust);
  if (job.title) parts.push(job.title);
  const due = fmtAmountDue(job);
  if (due) parts.push(due);
  return parts.join(" · ") || job.id;
}

/** Core fields shown side by side in the duplicate-invoice prompt. */
export function jobCompareFields(job, jobs) {
  const j = job || {};
  return {
    name: boardCustomerLabel(j, jobs) || "",
    serviceAddress: String(j.serviceAddress || j.address || "").trim(),
    amount: fmtAmountDue(j) || String(j.amount || "").trim(),
    invoiceNo: String(j.invoiceNo || "").trim(),
    title: String(j.title || "").trim(),
  };
}

export function invoiceCompareRows(jobA, jobB, jobs) {
  const a = jobCompareFields(jobA, jobs);
  const b = jobCompareFields(jobB, jobs);
  return [
    { label: "Customer", left: a.name, right: b.name },
    { label: "Service", left: a.serviceAddress, right: b.serviceAddress },
    { label: "Amount", left: a.amount, right: b.amount },
    { label: "Invoice #", left: a.invoiceNo, right: b.invoiceNo },
  ];
}

/** First pair of active jobs that share an invoice number. */
export function findDuplicateInvoiceSuggestion(jobs) {
  const byInv = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const no = String(j.invoiceNo || "").trim();
    if (!no) continue;
    if (!byInv.has(no)) byInv.set(no, []);
    byInv.get(no).push(j);
  }
  const list = [...byInv.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [no, group] of list) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    if (isInvoiceDismissed(no, a.id, b.id)) continue;
    return {
      id: invoicePairId(no, a.id, b.id),
      invoiceNo: no,
      a: { job: a, summary: jobSummary(a, jobs) },
      b: { job: b, summary: jobSummary(b, jobs) },
      extra: group.length > 2 ? group.length - 2 : 0,
    };
  }
  return null;
}