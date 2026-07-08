// Apply QuickBooks payment fetch results to a job overlay.
import { parseAmount, todayStr } from "./format.js";
import {
  amountOwedAtStart,
  applyPaymentsPatch,
  normalizePayments,
  parseBalanceFromNotes,
  totalPaid,
} from "./payments.js";

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

  const payments = fetch.payments
    .map((p) => {
      const amt = parseAmount(p.amount);
      if (amt <= 0) return null;
      const whole = amt % 1 === 0;
      return {
        id: p.id || "qbo-" + (p.ref || amt),
        amount: whole ? "$" + Math.round(amt) : "$" + amt.toFixed(2),
        method: p.method || "QBO",
        ref: p.ref || "",
        date: p.date || todayStr(),
        source: p.source || "qbo",
      };
    })
    .filter(Boolean);

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
    method: method || "Card",
    ref: ref || "",
    date: date || todayStr(),
    source: "sola",
    recorded: false,
  };
  const merged = { ...job, paymentBaseline: job.paymentBaseline != null ? job.paymentBaseline : owedBefore };
  return applyPaymentsPatch(merged, [...existing, entry]);
}

export function sumPaymentsList(payments) {
  return totalPaid(payments);
}