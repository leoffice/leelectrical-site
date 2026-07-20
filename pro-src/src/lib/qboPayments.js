// Apply QuickBooks payment fetch results to a job overlay.
import { parseAmount, todayStr } from "./format.js";
import {
  amountOwedAtStart,
  applyPaymentsPatch,
  normalizePaymentMethod,
  normalizePayments,
  parseBalanceFromNotes,
  totalPaid,
} from "./payments.js";

function refFromNote(note, fallback) {
  const m = String(note || "").match(/\bref\s+([A-Za-z0-9_-]+)/i);
  return m ? m[1] : fallback || "";
}

/* Payment ids MUST NOT share the "qbo-" namespace with job ids.
 * A job id is "qbo-" + invoice DocNumber; a QBO payment entity id is a small
 * integer in the SAME range as those DocNumbers, so "qbo-" + paymentId collides
 * with a real, unrelated invoice (537 live collisions as of 2026-07-20).
 * Everything payment-side is namespaced "qbopay-" instead. Sola ids already
 * carry their own "sola-" namespace and are left alone. */
export const PAY_NS = "qbopay-";

/** QBO payment entity id from any historical id shape ("qbo-19960" legacy,
 *  "qbopay-19960" current) or the explicit field. */
export function qboPaymentIdOf(p) {
  const explicit = String(p?.qboPaymentId || "").trim();
  if (explicit) return explicit;
  const id = String(p?.id || "").trim();
  if (id.startsWith(PAY_NS)) return id.slice(PAY_NS.length);
  // Legacy "qbo-<n>" payment ids — the colliding shape we are migrating off.
  if (/^qbo-\d+$/.test(id)) return id.slice(4);
  return "";
}

/** Canonical, collision-free payment id. */
export function paymentId(p, amt) {
  const id = String(p?.id || "").trim();
  if (id.startsWith("sola-")) return id; // already namespaced
  const qid = qboPaymentIdOf(p);
  if (qid) return PAY_NS + qid;
  const ref = String(p?.ref || "").trim();
  if (ref) return PAY_NS + "ref-" + ref;
  return PAY_NS + "amt-" + amt;
}

/** @param job the invoice/job this payment is nested under — used to stamp the
 *  back-reference so a payment row can say WHICH invoice it belongs to and be
 *  tappable through to it. */
function mapFetchedPayment(p, job) {
  const amt = parseAmount(p.amount);
  if (amt <= 0) return null;
  const whole = amt % 1 === 0;
  const note = p.note || p.privateNote || "";
  const ref = refFromNote(note, p.ref) || p.ref || "";
  return {
    id: paymentId(p, amt),
    amount: whole ? "$" + Math.round(amt) : "$" + amt.toFixed(2),
    method: normalizePaymentMethod(p.method, { note, ref }),
    ref,
    date: p.date || todayStr(),
    source: p.source || "qbo",
    qboPaymentId: qboPaymentIdOf(p),
    syncToken: p.syncToken != null ? String(p.syncToken) : "",
    note,
    // Back-reference: which invoice this payment is for.
    invoiceNo: String(p.invoiceNo || job?.invoiceNo || "").trim(),
    jobId: String(p.jobId || job?.id || "").trim(),
  };
}

function parseFetchResult(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** Turn fetch_payments command JSON into a patchJob overlay. */
export function patchFromQboPaymentFetch(job, fetchRaw) {
  const fetch = parseFetchResult(fetchRaw);
  if (!fetch?.payments) return null;

  const payments = fetch.payments.map((p) => mapFetchedPayment(p, job)).filter(Boolean);

  const baseline =
    parseAmount(job?.amount) ||
    parseAmount(fetch.invoiceTotal) ||
    parseAmount(job?.paymentBaseline) ||
    0;
  const qboBalance = fetch.openBalance != null ? parseAmount(fetch.openBalance) : null;
  const merged = { ...job, payments, paymentBaseline: baseline };
  const patch = applyPaymentsPatch(merged, payments);
  if (qboBalance != null && qboBalance >= 0) {
    patch.openBalance = qboBalance <= 0.01 ? 0 : qboBalance;
    patch.paid = qboBalance <= 0.01;
    if (!patch.paid) {
      patch.status = { Paid: { s: "" }, "Follow-up": { s: "" } };
    }
  }
  return patch;
}

/** Merge a new Sola payment into job overlay without marking fully paid on partial pay. */
export function patchFromSolaPayment(job, { amount, ref, method, date }) {
  const payAmt = parseAmount(amount);
  if (payAmt <= 0) return null;
  const payId = ref ? "sola-" + ref : "sola-" + Date.now();
  const existing = normalizePayments(job);
  if (existing.some((p) => p.id === payId)) return null;
  const owedBefore =
    job.paymentBaseline != null && job.paymentBaseline !== ""
      ? parseAmount(job.paymentBaseline)
      : existing.length
        ? amountOwedAtStart(job, existing)
        : parseAmount(job.openBalance) || parseBalanceFromNotes(job) || parseAmount(job.amount);
  const entry = {
    id: payId,
    amount: payAmt % 1 ? "$" + payAmt.toFixed(2) : "$" + Math.round(payAmt),
    method: normalizePaymentMethod(method, { ref }),
    ref: ref || "",
    date: date || todayStr(),
    source: "sola",
    recorded: false,
    invoiceNo: String(job?.invoiceNo || "").trim(),
    jobId: String(job?.id || "").trim(),
  };
  const merged = { ...job, paymentBaseline: job.paymentBaseline != null ? job.paymentBaseline : owedBefore };
  return applyPaymentsPatch(merged, [...existing, entry]);
}

export function sumPaymentsList(payments) {
  return totalPaid(payments);
}