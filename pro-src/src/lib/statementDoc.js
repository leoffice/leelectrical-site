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

/** First non-empty line of multi-line text, trimmed of boilerplate tails. */
function firstContentLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);
  for (const ln of lines) {
    // Skip pure section headers that make statements look "choppy"
    if (/^(price\s+includes|price\s+excludes|includes|excludes)\s*:?\s*$/i.test(ln)) continue;
    let out = ln.replace(/\s*Price Includes:?\s*$/i, "").trim();
    // Drop trailing ellipsis junk (… or ...) so the PDF never inherits three dots
    out = out.replace(/(?:\u2026|\.{3,})\s*$/g, "").trim();
    // PDF esc() turns non-ASCII into "?" — normalize common punctuation first
    out = out
      .replace(/[·•]/g, " - ")
      .replace(/[–—]/g, "-")
      .replace(/\u2026/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (out) return out;
  }
  return "";
}

/**
 * Human statement description — prefer invoice line copy over job.title,
 * keep progress + change-order hints, avoid dumping multi-paragraph text.
 */
export function statementDescription(job) {
  const lines = Array.isArray(job?.invoiceLines) ? job.invoiceLines : [];
  let desc = "";
  if (lines.length) {
    desc = firstContentLine(lines[0]?.description || lines[0]?.desc || "");
  }
  if (!desc) {
    desc = firstContentLine(job?.title || job?.serviceType || "") || "Electrical services";
  }
  // Fold a short CO / second-line hint when present (ASCII only — no … / · for PDF)
  if (lines.length > 1) {
    const second = firstContentLine(lines[1]?.description || lines[1]?.desc || "");
    const co = second.match(/Change Order\s*#?\s*\d+/i);
    if (co) {
      desc = `${desc} - ${co[0]}`;
    } else if (lines.length === 2 && second && second.length <= 48) {
      desc = `${desc} - ${second}`;
    } else if (lines.length > 1) {
      desc = `${desc} - +${lines.length - 1} line${lines.length > 2 ? "s" : ""}`;
    }
  }
  // Soft cap; PDF wraps without three-dot ellipsis (Levi 2026-08-05)
  return desc.length > 160 ? desc.slice(0, 160).trimEnd() : desc;
}

/**
 * Progress label from line qty / progressPct first, then job.invoiceProgressPct.
 * Seewald-style: qty 0.75 × $40k → "Progress 75%".
 */
export function progressLabel(job) {
  if (!isProgressInvoiceJob(job)) return "";
  const lines = Array.isArray(job?.invoiceLines) ? job.invoiceLines : [];
  const pcts = [];
  for (const ln of lines) {
    if (ln?.progressPct != null && ln.progressPct !== "") {
      const p = parseAmount(ln.progressPct);
      if (p > 0 && p < 99.99) pcts.push(Math.round(p * 10) / 10);
      continue;
    }
    if (ln?.progressBilling || (parseAmount(ln?.qty) > 0 && parseAmount(ln?.qty) < 0.9999)) {
      const q = parseAmount(ln?.qty);
      if (q > 0 && q < 0.9999) pcts.push(Math.round(q * 1000) / 10); // 0.75 → 75
    }
  }
  if (pcts.length === 1) return `Progress ${pcts[0]}%`;
  if (pcts.length > 1) {
    const uniq = [...new Set(pcts)];
    return uniq.length === 1 ? `Progress ${uniq[0]}%` : `Progress ${uniq.join(" / ")}%`;
  }
  const pct = parseAmount(job?.invoiceProgressPct);
  if (pct > 0 && pct < 99.99) return `Progress ${Math.round(pct * 10) / 10}%`;
  return "Progress / installment";
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
  const prog = progressLabel(job);
  return {
    id: String(job.id || inv || Math.random()),
    jobId: job.id,
    invoiceNo: inv,
    date: fmtInvoiceDate(dateRaw),
    dateIso: iso,
    description: statementDescription(job),
    address: serviceAddressLabel(job),
    charge,
    paid,
    balance,
    isOpen: balance > 0.009,
    progressLabel: prog,
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

  // Balance-forward: prior balance = sum of open balances for invoices BEFORE dateFrom.
  let priorBalance = 0;
  if (typeId === "balance_forward" && dateFrom) {
    priorBalance = allItems
      .filter((r) => r.dateIso && r.dateIso < dateFrom)
      .reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
  }

  // Payment activity lines (chronological) — used for PDF history + firstPaymentDate.
  const paymentLines = [];
  if (typeId === "activity" || typeId === "balance_forward" || typeId === "open_items") {
    for (const r of rows) {
      const pays = normalizePayments(r.job);
      for (const p of pays) {
        const pIso = dateKey(p.date || p.paidAt || p.createdAt);
        // Open items: always show payments on selected invoices.
        // Activity / balance-forward: respect date range when set.
        if (useRange && (dateFrom || dateTo) && !inDateRange(pIso, dateFrom, dateTo)) continue;
        paymentLines.push({
          date: fmtInvoiceDate(p.date || p.paidAt || pIso),
          dateIso: pIso,
          invoiceNo: r.invoiceNo,
          method: s(p.method || p.type || "Payment"),
          amount: parseAmount(p.amount),
          ref: s(p.ref || p.confirmation || p.txnId),
          unverified: !!(p.unverified || p.pending || p.status === "unverified"),
          jobId: r.jobId,
        });
      }
    }
    paymentLines.sort((a, b) => {
      if (a.dateIso && b.dateIso && a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
      return 0;
    });
  }

  /**
   * Activity + balance-forward PDF rows: true ledger —
   * invoice charge rows + one row per payment (transaction history).
   * Open items stays invoice-centric (balance due) but still exposes paymentLines.
   */
  let displayRows = rows;
  if (typeId === "activity" || typeId === "balance_forward") {
    const events = [];
    for (const r of rows) {
      // Progress first so PDF width-clip never drops the progress %.
      const desc = r.progressLabel ? `${r.progressLabel} - ${r.description}` : r.description;
      events.push({
        id: `${r.id}:inv`,
        kind: "invoice",
        jobId: r.jobId,
        invoiceNo: r.invoiceNo,
        date: r.date,
        dateIso: r.dateIso,
        description: desc,
        address: r.address,
        charge: r.charge,
        paid: 0,
        balance: r.balance,
        isOpen: r.isOpen,
        progressLabel: r.progressLabel,
        job: r.job,
      });
    }
    for (const p of paymentLines) {
      const method = p.method || "Payment";
      // Prefer clean Zelle wording; never use middle-dot (PDF turns · into ?)
      const refBit = p.ref && !/^\d+$/.test(String(p.ref)) ? ` ${p.ref}` : "";
      const payLabel =
        /zelle/i.test(method) || /zelle/i.test(p.note || "")
          ? `Payment - Zelle${refBit}`
          : `Payment - ${method}${refBit ? ` -${refBit}` : ""}`;
      events.push({
        id: `${p.invoiceNo}:pay:${p.dateIso}:${p.amount}:${p.ref || ""}`,
        kind: "payment",
        jobId: p.jobId,
        invoiceNo: p.invoiceNo,
        date: p.date,
        dateIso: p.dateIso,
        description: payLabel,
        address: "",
        charge: 0,
        paid: p.amount,
        balance: 0,
        isOpen: false,
        progressLabel: "",
        unverified: p.unverified,
        job: null,
      });
    }
    events.sort((a, b) => {
      if (a.dateIso && b.dateIso && a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
      // Same day: invoices before payments; then by invoice #
      if (a.kind !== b.kind) return a.kind === "invoice" ? -1 : 1;
      return String(a.invoiceNo).localeCompare(String(b.invoiceNo));
    });
    let running = priorBalance;
    displayRows = events.map((e) => {
      if (e.kind === "invoice") running += Number(e.charge) || 0;
      else running -= Number(e.paid) || 0;
      return { ...e, runningBalance: Math.round(running * 100) / 100 };
    });
  }

  const totalCharge = rows.reduce((sum, r) => sum + (Number(r.charge) || 0), 0);
  const totalPaidFromLines =
    paymentLines.length > 0
      ? paymentLines.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      : rows.reduce((sum, r) => sum + (Number(r.paid) || 0), 0);
  // Prefer ledger-derived payments when we expanded them; else invoice paid totals.
  const totalPaid =
    typeId === "activity" || typeId === "balance_forward"
      ? totalPaidFromLines
      : rows.reduce((sum, r) => sum + (Number(r.paid) || 0), 0);
  const totalBalance =
    typeId === "balance_forward"
      ? Math.round((priorBalance + rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0)) * 100) / 100
      : typeId === "activity" && displayRows.length
        ? displayRows[displayRows.length - 1].runningBalance
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
    /** Invoice-level rows (selection source). */
    invoiceRows: rows,
    /** PDF/table rows — ledger for activity/balance-forward. */
    rows: displayRows,
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
