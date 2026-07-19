// Job payment ledger — supports multiple payments per invoice (partial pay).
import { fmt$, parseAmount } from "./format.js";
import { isBrandNoteToken } from "../../../shared/productBrand.mjs";
import { productName } from "./tenantBranding.js";

function invoiceTotal(job) {
  return parseAmount(job?.amount);
}

export function paymentId() {
  return "pay-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

/** Parse "open balance $11,000" style hints from notes / follow-up. */
export function parseBalanceFromNotes(job) {
  const hay = [job?.notes, job?.followUp && job.followUp.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining|still\s*owes?)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  return m ? parseAmount(m[1]) : null;
}

/** All payments on a job (migrates legacy single job.payment). */
export function normalizePayments(job) {
  const list = Array.isArray(job?.payments) ? job.payments.map((p) => ({ ...p })) : [];
  const legacy = job?.payment;
  if (legacy && (legacy.amount || legacy.method || legacy.ref)) {
    const lid = legacy.id || "legacy-" + (legacy.date || legacy.ref || "0");
    if (!list.some((p) => p.id === lid)) {
      list.push({ ...legacy, id: lid });
    }
  }
  return list
    .filter((p) => parseAmount(p.amount) > 0 || p.method || p.ref)
    .map((p) => ({ ...p, id: p.id || paymentId() }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export function totalPaid(payments) {
  return (payments || []).reduce((s, p) => s + parseAmount(p.amount), 0);
}

/** Invoice amount owed before any recorded payments in LE Pro. */
export function amountOwedAtStart(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") {
    return parseAmount(job.paymentBaseline);
  }
  const paidSum = totalPaid(payments);
  const curOpen =
    job?.openBalance != null && job.openBalance !== "" ? parseAmount(job.openBalance) : null;
  if (curOpen != null && paidSum > 0) return curOpen + paidSum;
  const noteBal = parseBalanceFromNotes(job);
  if (noteBal != null) return noteBal;
  return invoiceTotal(job) || parseAmount(job?.amount);
}

export function remainingBalance(job, payments) {
  const owed = amountOwedAtStart(job, payments);
  return Math.max(0, owed - totalPaid(payments));
}

/** Build overlay patch after payments[] changed (add / edit / delete). */
export function applyPaymentsPatch(job, payments) {
  const list = payments.map((p) => ({ ...p }));
  const owed = amountOwedAtStart(job, list);
  const remaining = Math.max(0, owed - totalPaid(list));
  const fullPay = remaining <= 0.01;
  const latest = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();
  const patch = {
    payments: list,
    paymentBaseline: job?.paymentBaseline != null ? job.paymentBaseline : owed,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
    payment: latest || null,
  };
  if (fullPay && latest?.date) {
    patch.status = { Paid: { s: "done", d: latest.date }, "Follow-up": { s: "done", d: latest.date } };
  } else {
    patch.status = { Paid: { s: "" }, "Follow-up": { s: "" } };
  }
  return patch;
}

export function appendPayment(job, entry) {
  const list = normalizePayments(job);
  const pay = { id: paymentId(), ...entry, amount: String(parseAmount(entry.amount) || entry.amount || "") };
  return applyPaymentsPatch(job, [...list, pay]);
}

export function updatePayment(job, payId, entry) {
  const list = normalizePayments(job).map((p) =>
    p.id === payId ? { ...p, ...entry, amount: String(parseAmount(entry.amount) || entry.amount || "") } : p
  );
  return applyPaymentsPatch(job, list);
}

export function removePayment(job, payId) {
  const list = normalizePayments(job).filter((p) => p.id !== payId);
  return applyPaymentsPatch(job, list);
}

/** User-facing payment method (never raw "QBO"). */
export function normalizePaymentMethod(raw, opts = {}) {
  const note = String(opts.note || "").trim();
  const ref = String(opts.ref || "").trim();
  let s = String(raw || "").trim();
  if (note.includes(" — ")) {
    const first = note.split(" — ")[0].trim();
    // isBrandNoteToken accepts BOTH the legacy literal and the current product
    // name: these notes sit on records written before any rename, so matching
    // only the current name would orphan every historical payment.
    if (first && first.toLowerCase() !== "sola online payment" && !isBrandNoteToken(first, productName())) {
      s = first;
    }
  }
  const lower = s.toLowerCase();
  if (!s || lower === "qbo") {
    const hay = (note + " " + ref).toLowerCase();
    if (/^jpm/i.test(ref) || /zelle/.test(hay)) return "Zelle";
    if (/visa|mastercard|amex|american express|discover|sola|cardknox|credit/.test(hay)) return "Credit card";
    if (/^chk|check|cheque/i.test(ref) || /\bcheck\b/.test(hay)) return "Check";
    if (/\bcash\b/.test(hay)) return "Cash";
    if (/wells/.test(hay)) return "Wells Fargo";
    return "Other";
  }
  if (/^visa$|^mastercard$|^mc$|^amex$|^discover$/i.test(s)) return "Credit card";
  if (lower === "card") return "Credit card";
  return s;
}

export function canVoidInQbo(p) {
  return (
    p?.source === "qbo" &&
    Boolean(p?.qboPaymentId) &&
    p?.syncToken != null &&
    String(p.syncToken) !== ""
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Friendly payment date — e.g. Mar/06/26 */
export function fmtPaymentDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const mo = parseInt(m[2], 10);
    const day = m[3];
    const yr = m[1].slice(-2);
    if (mo >= 1 && mo <= 12) return MONTHS[mo - 1] + "/" + day + "/" + yr;
  }
  return s;
}

export function fmtPaymentLine(p) {
  const bits = [fmt$(parseAmount(p.amount))];
  const method = normalizePaymentMethod(p.method, { note: p.note, ref: p.ref });
  if (method) bits.push(method);
  const date = fmtPaymentDate(p.date);
  if (date) bits.push(date);
  if (p.ref) bits.push("#" + String(p.ref).replace(/^#/, ""));
  return bits.join(" · ");
}