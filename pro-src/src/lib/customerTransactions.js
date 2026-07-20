// Customer-level transaction ledger — invoices, estimates, payments across
// all job addresses for one company (not sub-companies).
import { openBalance, invoiceTotal } from "./customers.js";
import { normalizePayments, normalizePaymentMethod, fmtPaymentDate } from "./payments.js";
import { fmt$, parseAmount } from "./format.js";
import { serviceAddressDisplay } from "./customerSync.js";

/** Soft palette — same invoice # always gets the same bubble color. */
const LINK_COLORS = [
  { bg: "bg-sky-100", text: "text-sky-800", ring: "ring-sky-200" },
  { bg: "bg-violet-100", text: "text-violet-800", ring: "ring-violet-200" },
  { bg: "bg-amber-100", text: "text-amber-900", ring: "ring-amber-200" },
  { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200" },
  { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-200" },
  { bg: "bg-indigo-100", text: "text-indigo-800", ring: "ring-indigo-200" },
  { bg: "bg-teal-100", text: "text-teal-800", ring: "ring-teal-200" },
  { bg: "bg-orange-100", text: "text-orange-900", ring: "ring-orange-200" },
];

/** Stable color pair for an invoice / estimate number. */
export function linkColorForDoc(docNo) {
  const s = String(docNo || "").trim();
  if (!s) return LINK_COLORS[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return LINK_COLORS[h % LINK_COLORS.length];
}

/** Short date like Mar/06/26 or 03/15/26 from ISO / US strings. */
export function shortTxnDate(raw) {
  const paid = fmtPaymentDate(raw);
  if (paid) return paid;
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[2] + "/" + iso[3] + "/" + iso[1].slice(-2);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const yr = us[3].length === 2 ? us[3] : us[3].slice(-2);
    return us[1].padStart(2, "0") + "/" + us[2].padStart(2, "0") + "/" + yr;
  }
  return s;
}

/**
 * Which invoice is this payment applied to?
 *
 * Order matters. The explicit back-reference (added by the payment-namespace
 * fix) wins when present, but most stored payments predate it — for those the
 * job the payment is NESTED UNDER is the truth, and always has been: the
 * nesting was never what broke, only the id namespace was. So this resolves
 * correctly both before and after the re-key migration.
 *
 * Returns { invoiceNo, jobId, unlinked }. Never guesses: a payment on a job
 * with no invoice number is reported unlinked rather than mislabelled.
 */
export function resolvePaymentInvoice(payment, hostJob, jobsById) {
  const byId = jobsById instanceof Map ? jobsById : null;
  const refJobId = String(payment?.jobId || "").trim();
  const refInvNo = String(payment?.invoiceNo || "").trim();

  if (refJobId) {
    const target = byId?.get(refJobId) || (hostJob?.id === refJobId ? hostJob : null);
    const invoiceNo = String(target?.invoiceNo || refInvNo || "").trim();
    if (invoiceNo) return { invoiceNo, jobId: refJobId, unlinked: false };
  }
  if (refInvNo) {
    return { invoiceNo: refInvNo, jobId: refJobId || hostJob?.id || "", unlinked: false };
  }
  const hostInv = String(hostJob?.invoiceNo || "").trim();
  if (hostInv) return { invoiceNo: hostInv, jobId: hostJob?.id || "", unlinked: false };

  return { invoiceNo: "", jobId: hostJob?.id || "", unlinked: true };
}

/** Estimate → the invoice it became, when the same job carries both. */
function convertedInvoiceNo(job) {
  return job?.estimateNo && job?.invoiceNo ? String(job.invoiceNo) : "";
}

/** Totals across a customer's whole history: invoiced / paid / balance due. */
export function customerTransactionSummary(jobs) {
  let invoiced = 0;
  let paid = 0;
  let due = 0;
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    if (!j.invoiceNo) continue; // estimates are not money owed
    invoiced += invoiceTotal(j);
    due += openBalance(j);
    for (const p of normalizePayments(j)) paid += parseAmount(p.amount);
  }
  return { invoiced, paid, due };
}

function invoiceSortDate(job) {
  return (
    job?.invoiceDate ||
    job?.status?.Invoiced?.d ||
    job?.status?.Invoice?.d ||
    job?.updatedAt ||
    ""
  );
}

function estimateSortDate(job) {
  return (
    job?.estimateDate ||
    job?.status?.Estimate?.d ||
    job?.status?.Estimated?.d ||
    job?.updatedAt ||
    ""
  );
}

/**
 * Flat transaction rows for a customer (all job addresses, same company).
 * kind: invoice | payment | estimate
 */
export function buildCustomerTransactions(jobs, { filter = "all", sort = "new" } = {}) {
  const rows = [];
  const list0 = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const jobsById = new Map(list0.map((j) => [j.id, j]));
  for (const j of list0) {
    const address = serviceAddressDisplay(j);

    if (j.invoiceNo) {
      const total = invoiceTotal(j);
      const due = openBalance(j);
      const dateRaw = invoiceSortDate(j);
      rows.push({
        id: "inv:" + j.id + ":" + j.invoiceNo,
        kind: "invoice",
        sortDate: String(dateRaw || ""),
        jobId: j.id,
        job: j,
        docNo: String(j.invoiceNo),
        address,
        total,
        due,
        statusLabel: due > 0.01 ? "Open " + (fmt$(due) || "$0") : "Paid",
        isOpen: due > 0.01,
        dateLabel: shortTxnDate(dateRaw),
        color: linkColorForDoc(j.invoiceNo),
      });
    }

    if (j.estimateNo) {
      const dateRaw = estimateSortDate(j);
      rows.push({
        id: "est:" + j.id + ":" + j.estimateNo,
        kind: "estimate",
        sortDate: String(dateRaw || ""),
        jobId: j.id,
        job: j,
        docNo: String(j.estimateNo),
        address,
        total: invoiceTotal(j),
        due: 0,
        convertedTo: convertedInvoiceNo(j),
        statusLabel: convertedInvoiceNo(j)
          ? "Accepted"
          : j.status?.Accepted?.s === "done"
            ? "Accepted"
            : "Sent",
        dateLabel: shortTxnDate(dateRaw),
        color: linkColorForDoc(j.estimateNo),
      });
    }

    for (const p of normalizePayments(j)) {
      const dateRaw = p.date || "";
      const link = resolvePaymentInvoice(p, j, jobsById);
      rows.push({
        id: "pay:" + j.id + ":" + (p.id || dateRaw + p.amount),
        kind: "payment",
        sortDate: String(dateRaw || ""),
        // Tap target: the invoice this payment is applied to.
        jobId: link.jobId || j.id,
        job: j,
        payment: p,
        amount: p.amount,
        method: normalizePaymentMethod(p.method, { note: p.note, ref: p.ref }),
        ref: String(p.ref || "").trim(),
        docNo: link.invoiceNo,
        unlinked: link.unlinked,
        address,
        dateLabel: shortTxnDate(dateRaw),
        color: link.invoiceNo ? linkColorForDoc(link.invoiceNo) : LINK_COLORS[0],
      });
    }
  }

  let list = rows;
  if (filter === "invoices") list = rows.filter((r) => r.kind === "invoice");
  else if (filter === "payments") list = rows.filter((r) => r.kind === "payment");
  else if (filter === "estimates") list = rows.filter((r) => r.kind === "estimate");
  else if (filter === "open") list = rows.filter((r) => r.kind === "invoice" && r.isOpen);

  list = list.slice().sort((a, b) => {
    const da = String(a.sortDate || "");
    const db = String(b.sortDate || "");
    if (da && db && da !== db) {
      return sort === "old" ? da.localeCompare(db) : db.localeCompare(da);
    }
    if (da && !db) return sort === "old" ? -1 : 1;
    if (!da && db) return sort === "old" ? 1 : -1;
    // Stable secondary: kind then doc #
    const ka = a.kind + ":" + (a.docNo || a.id);
    const kb = b.kind + ":" + (b.docNo || b.id);
    return sort === "old" ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });

  return list;
}

export function txnFilterCounts(jobs) {
  const all = buildCustomerTransactions(jobs, { filter: "all" });
  return {
    all: all.length,
    invoices: all.filter((r) => r.kind === "invoice").length,
    payments: all.filter((r) => r.kind === "payment").length,
    estimates: all.filter((r) => r.kind === "estimate").length,
    open: all.filter((r) => r.kind === "invoice" && r.isOpen).length,
    unlinked: all.filter((r) => r.kind === "payment" && r.unlinked).length,
  };
}

export function formatTxnAmount(n) {
  return fmt$(n) || "$0";
}
