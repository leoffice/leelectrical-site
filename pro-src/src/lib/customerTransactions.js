// Customer-level transaction ledger — invoices, estimates, payments across
// all job addresses for one company (not sub-companies).
import { openBalance, invoiceTotal } from "./customers.js";
import { normalizePayments, normalizePaymentMethod, fmtPaymentDate } from "./payments.js";
import { fmt$ } from "./format.js";
import { serviceAddressDisplay } from "./customerSync.js";

/**
 * Soft palette for doc-number bubbles — NO green (payment amount stays green).
 * Same invoice # always gets the same color + shape so linked rows match.
 * When the palette wraps (many invoices), shape cycles: pill → square → diamond edge.
 */
const LINK_COLORS = [
  { bg: "bg-sky-100", text: "text-sky-900", ring: "ring-sky-400", border: "border-sky-400" },
  { bg: "bg-violet-100", text: "text-violet-900", ring: "ring-violet-400", border: "border-violet-400" },
  { bg: "bg-amber-100", text: "text-amber-950", ring: "ring-amber-500", border: "border-amber-500" },
  { bg: "bg-rose-100", text: "text-rose-900", ring: "ring-rose-400", border: "border-rose-400" },
  { bg: "bg-indigo-100", text: "text-indigo-900", ring: "ring-indigo-400", border: "border-indigo-400" },
  { bg: "bg-teal-100", text: "text-teal-900", ring: "ring-teal-500", border: "border-teal-500" },
  { bg: "bg-orange-100", text: "text-orange-950", ring: "ring-orange-500", border: "border-orange-500" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-900", ring: "ring-fuchsia-400", border: "border-fuchsia-400" },
  { bg: "bg-cyan-100", text: "text-cyan-900", ring: "ring-cyan-500", border: "border-cyan-500" },
  { bg: "bg-lime-100", text: "text-lime-950", ring: "ring-lime-500", border: "border-lime-500" },
  { bg: "bg-pink-100", text: "text-pink-900", ring: "ring-pink-400", border: "border-pink-400" },
  { bg: "bg-blue-100", text: "text-blue-900", ring: "ring-blue-500", border: "border-blue-500" },
];

/** pill = rounded-full; square = rounded-md; tag = rounded-sm + left bar feel */
const LINK_SHAPES = ["pill", "square", "tag"];

/** Type-word colors on the row label (Payment / Invoice / Estimate). */
export const TXN_KIND_STYLES = {
  payment: { label: "Payment", className: "text-emerald-600" },
  invoice: { label: "Invoice", className: "text-slate-700" },
  estimate: { label: "Estimate", className: "text-amber-700" },
};

export function txnKindStyle(kind) {
  return TXN_KIND_STYLES[kind] || TXN_KIND_STYLES.invoice;
}

function hashDoc(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable color + shape for an invoice / estimate number. */
export function linkColorForDoc(docNo) {
  const s = String(docNo || "").trim();
  if (!s) return { ...LINK_COLORS[0], shape: LINK_SHAPES[0] };
  const h = hashDoc(s);
  const colorIdx = h % LINK_COLORS.length;
  // Shape from higher bits so same color can still look different on collisions
  const shapeIdx = Math.floor(h / LINK_COLORS.length) % LINK_SHAPES.length;
  return { ...LINK_COLORS[colorIdx], shape: LINK_SHAPES[shapeIdx] };
}

/**
 * Assign colors within one customer list so nearby invoices rarely share a look.
 * Stable per doc #; prefers unused color+shape pairs before reusing.
 */
export function assignLinkStyles(keys) {
  const ordered = [];
  const seen = new Set();
  for (const k of keys || []) {
    const s = String(k || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    ordered.push(s);
  }
  const used = new Set();
  const map = new Map();
  for (const key of ordered) {
    const preferred = linkColorForDoc(key);
    let pick = preferred;
    const preferToken = preferred.bg + ":" + preferred.shape;
    if (used.has(preferToken)) {
      // Walk palette+shapes until free, then fall back to preferred
      let found = null;
      for (let s = 0; s < LINK_SHAPES.length && !found; s++) {
        for (let c = 0; c < LINK_COLORS.length && !found; c++) {
          const token = LINK_COLORS[c].bg + ":" + LINK_SHAPES[s];
          if (!used.has(token)) {
            found = { ...LINK_COLORS[c], shape: LINK_SHAPES[s] };
          }
        }
      }
      pick = found || preferred;
    }
    used.add(pick.bg + ":" + pick.shape);
    map.set(key, pick);
  }
  return map;
}

/**
 * Color key for linked docs: invoice family shares one color.
 * Prefer invoice # (same job or linked), else estimate #.
 */
export function linkColorKeyForJob(job) {
  const inv = String(job?.invoiceNo || job?.linkedInvoiceNo || "").trim();
  if (inv) return inv;
  return String(job?.estimateNo || "").trim();
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
  const liveJobs = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  // Pre-assign unique-ish color+shape per invoice family across this list
  const familyKeys = liveJobs.map((j) => linkColorKeyForJob(j)).filter(Boolean);
  const styleMap = assignLinkStyles(familyKeys);
  const defaultStyle = { ...LINK_COLORS[0], shape: LINK_SHAPES[0] };

  const rows = [];
  for (const j of liveJobs) {
    const address = serviceAddressDisplay(j);

    const familyKey = linkColorKeyForJob(j);
    const familyColor = familyKey
      ? styleMap.get(familyKey) || linkColorForDoc(familyKey)
      : defaultStyle;

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
        dateLabel: shortTxnDate(dateRaw),
        color: familyColor,
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
        dateLabel: shortTxnDate(dateRaw),
        // Same bubble color+shape as the invoice when linked
        color: familyColor,
      });
    }

    for (const p of normalizePayments(j)) {
      const dateRaw = p.date || "";
      rows.push({
        id: "pay:" + j.id + ":" + (p.id || dateRaw + p.amount),
        kind: "payment",
        sortDate: String(dateRaw || ""),
        jobId: j.id,
        job: j,
        payment: p,
        amount: p.amount,
        method: normalizePaymentMethod(p.method, { note: p.note, ref: p.ref }),
        docNo: j.invoiceNo ? String(j.invoiceNo) : j.linkedInvoiceNo ? String(j.linkedInvoiceNo) : "",
        address,
        dateLabel: shortTxnDate(dateRaw),
        color: familyColor,
      });
    }
  }

  let list = rows;
  if (filter === "invoices") list = rows.filter((r) => r.kind === "invoice");
  else if (filter === "payments") list = rows.filter((r) => r.kind === "payment");
  else if (filter === "estimates") list = rows.filter((r) => r.kind === "estimate");

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
  };
}

export function formatTxnAmount(n) {
  return fmt$(n) || "$0";
}
