// Job payment ledger — supports multiple payments per invoice (partial pay).
import { fmt$, parseAmount } from "./format.js";

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

export function fmtPaymentLine(p) {
  const bits = [fmt$(parseAmount(p.amount))];
  if (p.method) bits.push(p.method);
  if (p.ref) bits.push("ref " + p.ref);
  if (p.date) bits.push(p.date);
  return bits.join(" · ");
}