// Customer-level invoice / estimate / payment lists from board jobs.
import { sortJobs } from "./stages.js";
import { openBalance, invoiceTotal, amountPaid } from "./customers.js";
import { normalizePayments } from "./payments.js";
import { fmt$ } from "./format.js";
import { serviceAddressDisplay } from "./customerSync.js";
import { fmtInvoiceDate } from "./invoicePdf.js";
import { PAPER, paperworkUpNext } from "./paperwork.js";

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

/** Rich invoice row — address, paid-of-total, open/closed tone. */
export function invoiceRowDetail(job) {
  const no = job.invoiceNo || "—";
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const due = openBalance(job);
  const tone = invoiceButtonTone(job);
  const address = serviceAddressDisplay(job);
  let amountLine;
  if (tone === "paid") {
    amountLine = total > 0 ? `${fmt$(paid || total)} of ${fmt$(total)}` : fmt$(paid || total);
  } else if (paid > 0.01 && total > 0) {
    amountLine = `${fmt$(paid)} of ${fmt$(total)}`;
  } else {
    amountLine = total > 0 ? `${fmt$(due || total)} of ${fmt$(total)}` : fmt$(due);
  }
  return { no, address, amountLine, tone };
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

/** Short label for service-address job cards — not full pasted descriptions. */
export function jobQuickDescription(job) {
  const raw = String(job?.serviceType || job?.title || "").trim();
  if (raw && raw.length <= 48 && !raw.includes("\n")) return raw;
  if (job?.invoiceNo) return "Invoice #" + job.invoiceNo;
  if (job?.estimateNo) return "Estimate #" + job.estimateNo;
  if (raw) {
    const first = raw.split(/[.;,\n]/)[0].trim();
    return first.length <= 48 ? first : first.slice(0, 45) + "…";
  }
  return "Job";
}

function jobNeedsPay(job) {
  return !job?.paid && openBalance(job) > 0.01;
}

function jobHasOpenTasks(job) {
  if (!job) return false;
  const pw = job.paperwork || {};
  for (const k of Object.keys(PAPER)) {
    const br = pw[k];
    if (br?.enabled && paperworkUpNext(k, br)?.step) return true;
  }
  return false;
}

/** Service-address job row — invoice #, amount, Do/Pay action, color tone. */
export function addressJobRowDetail(job) {
  const pay = jobNeedsPay(job);
  const task = jobHasOpenTasks(job);
  let actionLabel = "";
  let tone = "neutral";

  if (pay && task) {
    actionLabel = "Do · Pay";
    tone = "both";
  } else if (pay) {
    actionLabel = "Pay";
    tone = "pay";
  } else if (task) {
    actionLabel = "Do";
    tone = "task";
  } else if (job?.paid || job?.invoiceNo) {
    tone = "paid";
  }

  const total = invoiceTotal(job);
  const due = openBalance(job);
  let amountLine = "";
  if (job?.invoiceNo) {
    amountLine = pay ? fmt$(due || total) : total > 0 ? fmt$(total) : "";
  } else if (total > 0) {
    amountLine = fmt$(total);
  }

  return {
    quickDesc: jobQuickDescription(job),
    invoiceNo: job?.invoiceNo || "",
    estimateNo: job?.estimateNo || "",
    amountLine,
    actionLabel,
    tone,
    address: serviceAddressDisplay(job),
  };
}

export function addressJobToneClass(tone) {
  if (tone === "pay") return "bg-red-50 text-red-800 border-red-200";
  if (tone === "task") return "bg-amber-50 text-amber-900 border-amber-200";
  if (tone === "both") return "bg-orange-50 text-orange-900 border-orange-200";
  if (tone === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export function jobInvoiceDateDisplay(job) {
  const raw =
    job?.invoiceDate ||
    job?.estimateDate ||
    job?.status?.Invoiced?.d ||
    job?.status?.Invoice?.d ||
    job?.status?.Estimate?.d ||
    "";
  return raw ? fmtInvoiceDate(raw) : "";
}

export function jobServiceDateDisplay(job) {
  const lines = [...(job?.invoiceLines || []), ...(job?.estimateLines || [])];
  const hit = lines.find((ln) => ln && (ln.serviceDate || ln.date));
  const raw = (hit && (hit.serviceDate || hit.date)) || job?.serviceDate || job?.status?.Scheduled?.d || "";
  return raw ? fmtInvoiceDate(raw) : "";
}