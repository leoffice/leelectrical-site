// Customer / job statement model — types, selectable rows, date range.
// Spec: LEPRO_STATEMENT_LETTERHEAD_SETTINGS_SPEC §1 + §1a (A295 fold-in).
import { amountPaid, invoiceTotal, isInvoiceJob, openBalance } from "./customers.js";
import { parseAmount, todayStr } from "./format.js";
import { fmtInvoiceDate } from "./invoicePdf.js";
import { isProgressInvoiceJob, normalizePayments } from "./payments.js";
import { buildPayLandingUrl } from "./payLanding.js";

/** @typedef {'open_items'|'activity'|'balance_forward'} StatementType */

export const STATEMENT_TYPES = [
  {
    id: "open_items",
    label: "Open items",
    hint: "Unpaid invoices and balances due",
  },
  {
    id: "activity",
    label: "Activity",
    hint: "Invoices and payments over a date range (running balance)",
  },
  {
    id: "balance_forward",
    label: "Balance-forward",
    hint: "Prior balance + new charges + payments = balance due",
  },
];

export const DEFAULT_STATEMENT_TYPE = "open_items";

const s = (v) => (v == null ? "" : String(v).trim());

function invoiceDateRaw(job) {
  return (
    s(job?.invoiceDate) ||
    s(job?.status?.Invoiced?.d) ||
    s(job?.status?.Invoice?.d) ||
    s(job?.txnDate) ||
    s(job?.date) ||
    ""
  );
}

function dateKey(raw) {
  const m = String(raw || "").match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(String(raw || ""));
  if (Number.isFinite(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function inDateRange(iso, from, to) {
  if (!iso) return !from && !to;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function serviceAddressLabel(job) {
  return s(job?.serviceAddress || job?.address || job?.location) || "No service address";
}

function progressLabel(job) {
  if (!isProgressInvoiceJob(job)) return "";
  const pct = parseAmount(job?.invoiceProgressPct);
  if (pct > 0 && pct < 99.99) return `Progress request · ${pct}%`;
  return "Progress / installment request";
}

/**
 * One selectable invoice row for the statement builder.
 * @param {object} job
 */
export function statementItemFromJob(job) {
  if (!isInvoiceJob(job)) return null;
  const charge = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const dateRaw = invoiceDateRaw(job);
  const iso = dateKey(dateRaw);
  const inv = s(job.invoiceNo);
  return {
    id: String(job.id || inv || Math.random()),
    jobId: job.id,
    invoiceNo: inv,
    date: fmtInvoiceDate(dateRaw),
    dateIso: iso,
    description: s(job.title || job.serviceType || "Electrical services").split("\n")[0].slice(0, 80),
    address: serviceAddressLabel(job),
    charge,
    paid,
    balance,
    isOpen: balance > 0.009,
    progressLabel: progressLabel(job),
    job,
  };
}

/** All invoice jobs → statement items (chronological oldest → newest). */
export function listStatementItems(jobs) {
  return (jobs || [])
    .map(statementItemFromJob)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.dateIso && b.dateIso && a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
      return String(a.invoiceNo).localeCompare(String(b.invoiceNo));
    });
}

/**
 * Default selected item ids for a statement type.
 * Open items → open balances only; activity / balance-forward → all invoices in range.
 */
export function defaultSelectedIds(items, type = DEFAULT_STATEMENT_TYPE) {
  const list = items || [];
  if (type === "open_items") {
    const open = list.filter((r) => r.isOpen);
    return (open.length ? open : list).map((r) => r.id);
  }
  return list.map((r) => r.id);
}

/**
 * Build the full statement model used by PDF + email + UI.
 *
 * @param {object} opts
 * @param {object[]} opts.jobs — customer or single-job list
 * @param {StatementType} [opts.type]
 * @param {string[]} [opts.selectedIds] — which invoice rows to include
 * @param {string} [opts.dateFrom] — YYYY-MM-DD
 * @param {string} [opts.dateTo] — YYYY-MM-DD
 * @param {string} [opts.customerName]
 * @param {string} [opts.customerEmail]
 * @param {string} [opts.billingAddress]
 * @param {string} [opts.asOf]
 * @param {boolean} [opts.includePayLinks]
 */
export function buildStatementModel({
  jobs = [],
  type = DEFAULT_STATEMENT_TYPE,
  selectedIds = null,
  dateFrom = "",
  dateTo = "",
  customerName = "",
  customerEmail = "",
  billingAddress = "",
  asOf = "",
  includePayLinks = true,
} = {}) {
  const allItems = listStatementItems(jobs);
  const typeId = STATEMENT_TYPES.some((t) => t.id === type) ? type : DEFAULT_STATEMENT_TYPE;

  // Date filter applies to activity + balance_forward; open items ignore range by default.
  const useRange = typeId === "activity" || typeId === "balance_forward";
  const ranged = useRange
    ? allItems.filter((r) => inDateRange(r.dateIso, dateFrom, dateTo))
    : allItems;

  const idSet =
    selectedIds == null
      ? new Set(defaultSelectedIds(ranged.length ? ranged : allItems, typeId))
      : new Set((selectedIds || []).map(String));

  let rows = ranged.filter((r) => idSet.has(String(r.id)));
  if (typeId === "open_items") {
    // Still allow Levi to include closed ones if he checked them.
    rows = rows.length ? rows : ranged.filter((r) => r.isOpen);
  }

  // Balance-forward: prior balance = sum of balances for invoices BEFORE dateFrom (not selected body).
  let priorBalance = 0;
  if (typeId === "balance_forward" && dateFrom) {
    priorBalance = allItems
      .filter((r) => r.dateIso && r.dateIso < dateFrom)
      .reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
  }

  // Activity / open: chronological; attach running balance for activity.
  let running = priorBalance;
  const activityRows = rows.map((r) => {
    running += Number(r.balance) || 0;
    return { ...r, runningBalance: Math.round(running * 100) / 100 };
  });

  const totalCharge = rows.reduce((sum, r) => sum + (Number(r.charge) || 0), 0);
  const totalPaid = rows.reduce((sum, r) => sum + (Number(r.paid) || 0), 0);
  const totalBalance =
    typeId === "balance_forward"
      ? Math.round((priorBalance + rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0)) * 100) / 100
      : rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);

  // Per-invoice pay rows (open only) for PDF annotations + email.
  const payRows = includePayLinks
    ? rows
        .filter((r) => r.isOpen && r.job)
        .map((r) => {
          const url = buildPayLandingUrl({
            job: r.job,
            linkAmount: r.balance,
            inv: r.invoiceNo,
          });
          return {
            inv: r.invoiceNo,
            amount: r.balance,
            url: url || "",
            jobId: r.jobId,
          };
        })
        .filter((p) => p.url)
    : [];

  const name =
    s(customerName) ||
    s(jobs[0]?.businessName) ||
    s(jobs[0]?.customer) ||
    s(jobs[0]?.personName) ||
    "Customer";
  const bill =
    s(billingAddress) ||
    s(jobs[0]?.billingAddress) ||
    s(jobs[0]?.address) ||
    "";
  const email = s(customerEmail) || s(jobs[0]?.email) || "";

  // Payment activity lines (for activity type detail — chronological payments).
  const paymentLines = [];
  if (typeId === "activity" || typeId === "balance_forward") {
    for (const r of rows) {
      const pays = normalizePayments(r.job);
      for (const p of pays) {
        const pIso = dateKey(p.date || p.paidAt || p.createdAt);
        if (useRange && !inDateRange(pIso, dateFrom, dateTo)) continue;
        paymentLines.push({
          date: fmtInvoiceDate(p.date || p.paidAt || pIso),
          dateIso: pIso,
          invoiceNo: r.invoiceNo,
          method: s(p.method || p.type || "Payment"),
          amount: parseAmount(p.amount),
          ref: s(p.ref || p.confirmation || p.txnId),
          unverified: !!(p.unverified || p.pending || p.status === "unverified"),
        });
      }
    }
    paymentLines.sort((a, b) => {
      if (a.dateIso && b.dateIso && a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
      return 0;
    });
  }

  const firstPaymentDate =
    paymentLines.length > 0
      ? paymentLines[0].date
      : rows
          .flatMap((r) => normalizePayments(r.job).map((p) => dateKey(p.date || p.paidAt)))
          .filter(Boolean)
          .sort()[0] || "";

  return {
    type: typeId,
    typeLabel: STATEMENT_TYPES.find((t) => t.id === typeId)?.label || "Open items",
    asOf: fmtInvoiceDate(asOf || todayStr()),
    dateFrom: dateFrom || "",
    dateTo: dateTo || "",
    customerName: name,
    customerEmail: email,
    billingAddress: bill,
    allItems,
    rows: typeId === "activity" ? activityRows : rows,
    paymentLines,
    payRows,
    priorBalance: Math.round(priorBalance * 100) / 100,
    totalCharge: Math.round(totalCharge * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalDue: Math.round(totalBalance * 100) / 100,
    firstPaymentDate: firstPaymentDate ? fmtInvoiceDate(firstPaymentDate) : "",
    selectedIds: rows.map((r) => r.id),
  };
}

/** Filename for download / attachment. */
export function statementFilename(model) {
  const name = s(model?.customerName)
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const day = (model?.asOf || todayStr()).replace(/\//g, "-");
  return name ? `Statement-${name}-${day}.pdf` : `Statement-${day}.pdf`;
}
