// Duplicate invoice detection — two active jobs sharing the same invoice #.
//
//   findDuplicateInvoiceSuggestion(jobs) -> first non-dismissed pair
//   dismissInvoicePair / isInvoiceDismissed -> lepro_noinvdedup memory

import { boardCustomerLabel, fmtAmountDue, invoiceTotal } from "./customers.js";

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

/** Canonical YYYY-MM-DD for invoice-date comparison. */
export function jobInvoiceDateKey(job) {
  const raw =
    job?.invoiceDate ||
    job?.status?.Invoiced?.d ||
    job?.status?.Invoice?.d ||
    "";
  const s = String(raw).trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return s;
}

/** True when two jobs share invoice #, date, and total amount. */
export function isExactInvoiceDuplicate(a, b) {
  const noA = String(a?.invoiceNo || "").trim();
  const noB = String(b?.invoiceNo || "").trim();
  if (!noA || noA !== noB) return false;
  const dateA = jobInvoiceDateKey(a);
  const dateB = jobInvoiceDateKey(b);
  if (!dateA || !dateB || dateA !== dateB) return false;
  const amtA = invoiceTotal(a);
  const amtB = invoiceTotal(b);
  return amtA > 0 && amtA === amtB;
}

/** Same invoice # but not an exact duplicate and not OK to keep separate (different date). */
export function shouldPromptInvoiceDedup(a, b) {
  const noA = String(a?.invoiceNo || "").trim();
  const noB = String(b?.invoiceNo || "").trim();
  if (!noA || noA !== noB) return false;
  if (isExactInvoiceDuplicate(a, b)) return false;
  const dateA = jobInvoiceDateKey(a);
  const dateB = jobInvoiceDateKey(b);
  if (dateA && dateB && dateA !== dateB) return false;
  return true;
}

/** Auto-delete weaker rows when invoice #, date, and amount all match. */
export function planExactInvoiceAutoDedup(jobs) {
  const byInv = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const no = String(j.invoiceNo || "").trim();
    if (!no) continue;
    if (!byInv.has(no)) byInv.set(no, []);
    byInv.get(no).push(j);
  }

  const actions = [];
  for (const [no, group] of byInv) {
    if (group.length < 2) continue;
    const clusters = new Map();
    for (const j of group) {
      const dk = jobInvoiceDateKey(j);
      const amt = invoiceTotal(j);
      if (!dk || amt <= 0) continue;
      const key = dk + "|" + amt;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(j);
    }
    for (const [, cluster] of clusters) {
      if (cluster.length < 2) continue;
      let keeper = cluster[0];
      for (let i = 1; i < cluster.length; i++) {
        keeper = pickKeeperJob(keeper, cluster[i]);
      }
      for (const j of cluster) {
        if (j.id !== keeper.id) {
          actions.push({ dropId: j.id, keepId: keeper.id, invoiceNo: no });
        }
      }
    }
  }
  return actions;
}

/** Core fields shown side by side in the duplicate-invoice prompt. */
export function jobCompareFields(job, jobs) {
  const j = job || {};
  return {
    name: boardCustomerLabel(j, jobs) || "",
    serviceAddress: String(j.serviceAddress || j.address || "").trim(),
    amount: fmtAmountDue(j) || String(j.amount || "").trim(),
    invoiceNo: String(j.invoiceNo || "").trim(),
    invoiceDate: jobInvoiceDateKey(j) || "",
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
    { label: "Invoice date", left: a.invoiceDate, right: b.invoiceDate },
    { label: "Invoice #", left: a.invoiceNo, right: b.invoiceNo },
  ];
}

/** Auto-imported qbo-* rows that duplicate an invoice already on another job. */
export function qboStubJobIds(jobs, invoiceNo, keepJobId) {
  const no = String(invoiceNo || "").trim();
  if (!no) return [];
  const keep = String(keepJobId || "");
  return (jobs || [])
    .filter((j) => {
      if (!j || j._archived || j._deleted) return false;
      if (String(j.id) === keep) return false;
      if (String(j.invoiceNo || "").trim() !== no) return false;
      return String(j.id || "").startsWith("qbo-");
    })
    .map((j) => j.id);
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
    for (let i = 0; i < group.length; i++) {
      for (let k = i + 1; k < group.length; k++) {
        const a = group[i];
        const b = group[k];
        if (!shouldPromptInvoiceDedup(a, b)) continue;
        if (isInvoiceDismissed(no, a.id, b.id)) continue;
        const prompted = group.filter(
          (j, idx) =>
            idx !== i &&
            idx !== k &&
            (shouldPromptInvoiceDedup(a, j) || shouldPromptInvoiceDedup(b, j))
        );
        return {
          id: invoicePairId(no, a.id, b.id),
          invoiceNo: no,
          a: { job: a, summary: jobSummary(a, jobs) },
          b: { job: b, summary: jobSummary(b, jobs) },
          extra: prompted.length,
        };
      }
    }
  }
  return null;
}