// Apply QuickBooks payment fetch results to a job overlay.
// Local paid status is authoritative — QBO is an additional backend step.
// Never un-pay a job because QuickBooks is still catching up.
import { parseAmount, todayStr } from "./format.js";
import {
  amountOwedAtStart,
  applyPaymentsPatch,
  normalizePaymentMethod,
  normalizePayments,
  parseBalanceFromNotes,
  remainingBalance,
  totalPaid,
} from "./payments.js";

function refFromNote(note, fallback) {
  const m = String(note || "").match(/\bref\s+([A-Za-z0-9_-]+)/i);
  return m ? m[1] : fallback || "";
}

function mapFetchedPayment(p) {
  const amt = parseAmount(p.amount);
  if (amt <= 0) return null;
  const whole = amt % 1 === 0;
  const note = p.note || p.privateNote || "";
  const ref = refFromNote(note, p.ref) || p.ref || "";
  return {
    id: p.id || "qbo-" + (p.qboPaymentId || ref || amt),
    amount: whole ? "$" + Math.round(amt) : "$" + amt.toFixed(2),
    method: normalizePaymentMethod(p.method, { note, ref }),
    ref,
    date: p.date || todayStr(),
    source: p.source || "qbo",
    qboPaymentId: p.qboPaymentId || (String(p.id || "").startsWith("qbo-") ? String(p.id).slice(4) : ""),
    syncToken: p.syncToken != null ? String(p.syncToken) : "",
    note,
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

function samePaymentRow(a, b) {
  if (!a || !b) return false;
  const aq = String(a.qboPaymentId || "").trim();
  const bq = String(b.qboPaymentId || "").trim();
  if (aq && bq && aq === bq) return true;
  if (a.id && b.id && String(a.id) === String(b.id)) return true;
  const sameAmt = Math.abs(parseAmount(a.amount) - parseAmount(b.amount)) <= 0.01;
  if (!sameAmt) return false;
  const sameDate =
    !a.date || !b.date || String(a.date).slice(0, 10) === String(b.date).slice(0, 10);
  const ar = String(a.ref || "").trim().toLowerCase();
  const br = String(b.ref || "").trim().toLowerCase();
  const sameRef = !ar || !br || ar === br;
  return sameDate && sameRef;
}

/**
 * Merge QBO payment rows with local ledger rows that QBO has not absorbed yet
 * (app-recorded check/Zelle/card still syncing).
 */
export function mergeLocalAndQboPayments(job, qboPayments) {
  const qbo = (qboPayments || []).filter(Boolean);
  const local = normalizePayments(job);
  const keepLocal = local.filter((p) => !qbo.some((q) => samePaymentRow(p, q)));
  return [...qbo, ...keepLocal];
}

/** Turn fetch_payments command JSON into a patchJob overlay. */
export function patchFromQboPaymentFetch(job, fetchRaw) {
  const fetch = parseFetchResult(fetchRaw);
  if (!fetch?.payments) return null;

  const qboPayments = fetch.payments.map(mapFetchedPayment).filter(Boolean);
  // Keep app-recorded payments that QBO has not absorbed yet.
  const payments = mergeLocalAndQboPayments(job, qboPayments);

  const baseline =
    parseAmount(job?.amount) ||
    parseAmount(fetch.invoiceTotal) ||
    parseAmount(job?.paymentBaseline) ||
    0;
  const qboBalance = fetch.openBalance != null ? parseAmount(fetch.openBalance) : null;
  const merged = { ...job, payments, paymentBaseline: baseline };
  const patch = applyPaymentsPatch(merged, payments);

  // Local ledger fully covers the invoice → paid is already true from applyPaymentsPatch.
  // QBO confirmation is optional/additional — never un-pay while backend is still syncing.
  const localRemaining = remainingBalance({ ...job, paymentBaseline: baseline, payments }, payments);
  const localSaysPaid = localRemaining <= 0.01 || !!job?.paid || !!patch.paid;

  if (qboBalance != null && qboBalance >= 0) {
    if (qboBalance <= 0.01) {
      // QBO says fully paid — trust that (may have payments we don't list yet).
      patch.openBalance = 0;
      patch.paid = true;
      if (!patch.status?.Paid?.s) {
        const d =
          payments[0]?.date ||
          job?.payment?.date ||
          todayStr();
        patch.status = { Paid: { s: "done", d }, "Follow-up": { s: "done", d } };
      }
    } else if (localSaysPaid) {
      // App already marked paid / ledger covers it — keep paid while QBO catches up.
      patch.openBalance = 0;
      patch.paid = true;
      const d =
        payments[0]?.date ||
        job?.payment?.date ||
        (job?.status && job.status.Paid && job.status.Paid.d) ||
        todayStr();
      patch.status = { Paid: { s: "done", d }, "Follow-up": { s: "done", d } };
    } else {
      // Both sides say still open — use the lower remaining so we don't inflate due.
      const fromLedger = remainingBalance({ ...job, paymentBaseline: baseline, payments }, payments);
      const open = Math.min(qboBalance, fromLedger);
      patch.openBalance = open <= 0.01 ? 0 : open;
      patch.paid = open <= 0.01;
      if (!patch.paid) {
        patch.status = { Paid: { s: "" }, "Follow-up": { s: "" } };
      }
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
  };
  const merged = { ...job, paymentBaseline: job.paymentBaseline != null ? job.paymentBaseline : owedBefore };
  return applyPaymentsPatch(merged, [...existing, entry]);
}

export function sumPaymentsList(payments) {
  return totalPaid(payments);
}
