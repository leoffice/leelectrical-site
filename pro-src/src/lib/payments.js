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

/**
 * True when this invoice looks like progress billing (partial % of a contract).
 * Used to repair frozen payment baselines after the invoice total is raised
 * (e.g. 50% → 80%) without breaking QBO imports where amount ≫ open balance.
 */
export function isProgressInvoiceJob(job) {
  if (!job) return false;
  if (job.invoiceProgressBilling) return true;
  if (job.invoiceProgressPct != null && job.invoiceProgressPct !== "" && parseAmount(job.invoiceProgressPct) < 99.99) {
    return true;
  }
  const lines = job.invoiceLines || [];
  if (lines.some((ln) => ln.progressBilling || (parseAmount(ln.qty) > 0 && parseAmount(ln.qty) < 0.9999))) {
    return true;
  }
  // Estimate-linked invoice — common path for progress draws.
  if (job.estimateLines?.length && String(job.invoiceNo || "").trim()) return true;
  if (parseAmount(job.contractAmount) > 0 && String(job.invoiceNo || "").trim()) return true;
  return false;
}

/** Frozen baseline before any LE Pro payments, adjusted when invoice total changes. */
function frozenBaseline(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") {
    return parseAmount(job.paymentBaseline);
  }
  const paidSum = totalPaid(payments);
  const curOpen =
    job?.openBalance != null && job.openBalance !== "" ? parseAmount(job.openBalance) : null;
  if (curOpen != null && paidSum > 0) return curOpen + paidSum;
  const noteBal = parseBalanceFromNotes(job);
  if (noteBal != null) return noteBal;
  return invoiceTotal(job) || parseAmount(job?.amount) || 0;
}

/**
 * Invoice amount owed before recorded payments.
 * When the invoice total is raised after payments (progress bill 50%→80%),
 * owed-at-start tracks the new total so balance due = invoice − paid.
 * amountWhenBaselined stamps the invoice total at the time paymentBaseline
 * was locked so later amount edits apply a clean delta.
 */
export function amountOwedAtStart(job, payments) {
  const inv = invoiceTotal(job);
  let baseline = frozenBaseline(job, payments);

  const stampedRaw = job?.amountWhenBaselined;
  const stamped =
    stampedRaw != null && stampedRaw !== "" ? parseAmount(stampedRaw) : null;

  if (stamped != null && inv > 0 && Math.abs(inv - stamped) > 0.009) {
    // Invoice total changed since baseline was set — shift owed by the same delta.
    baseline = Math.max(0, baseline + (inv - stamped));
  } else if (stamped == null && inv > 0 && baseline > 0 && inv > baseline + 0.009) {
    // Legacy: invoice total raised after paymentBaseline was frozen (progress draw
    // 50%→80%). Promote to invoice total when this looks like a full prior draw,
    // not a QBO import where amount ≫ open balance with little of that baseline paid.
    const paidSum = totalPaid(payments);
    const looksLikePriorFullDraw =
      isProgressInvoiceJob(job) || (paidSum > 0 && paidSum / baseline >= 0.3);
    if (looksLikePriorFullDraw) baseline = inv;
  }

  return baseline;
}

export function remainingBalance(job, payments) {
  const owed = amountOwedAtStart(job, payments);
  return Math.max(0, owed - totalPaid(payments));
}

/**
 * When invoice amount changes (progress % edit, line edits), recompute
 * paymentBaseline / openBalance so balance due stays invoice − paid.
 * Call from doc save with the NEW amount and the job BEFORE the amount patch.
 */
export function reconcileBalanceOnAmountChange(job, newAmount) {
  const inv = parseAmount(newAmount);
  if (!(inv >= 0) || !job) return {};
  const pays = normalizePayments(job);
  const paid = totalPaid(pays);
  const oldInv = invoiceTotal(job);

  let baseline = frozenBaseline(job, pays);
  if (oldInv > 0 && Math.abs(inv - oldInv) > 0.009) {
    baseline = Math.max(0, baseline + (inv - oldInv));
  } else if (pays.length && inv > baseline + 0.009) {
    // Amount raised with no prior total to diff — use new invoice total.
    baseline = inv;
  } else if (!pays.length) {
    // No payment ledger: open balance tracks the full invoice (unless already paid).
    if (job.paid && (job.openBalance == null || parseAmount(job.openBalance) === 0)) {
      return { amountWhenBaselined: inv };
    }
    const remaining = inv;
    const fullPay = remaining <= 0.01;
    return {
      openBalance: fullPay ? 0 : remaining,
      paid: fullPay || !!job.paid,
      amountWhenBaselined: inv,
      ...(job.paymentBaseline != null && job.paymentBaseline !== ""
        ? { paymentBaseline: inv }
        : {}),
    };
  }

  const remaining = Math.max(0, baseline - paid);
  const fullPay = remaining <= 0.01;
  return {
    paymentBaseline: baseline,
    amountWhenBaselined: inv,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
  };
}

/** Build overlay patch after payments[] changed (add / edit / delete). */
export function applyPaymentsPatch(job, payments) {
  const list = payments.map((p) => ({ ...p }));
  const inv = invoiceTotal(job);
  const owed = amountOwedAtStart(job, list);
  const remaining = Math.max(0, owed - totalPaid(list));
  const fullPay = remaining <= 0.01;
  const latest = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();
  const stamp =
    job?.amountWhenBaselined != null && job.amountWhenBaselined !== ""
      ? job.amountWhenBaselined
      : inv || owed;
  const patch = {
    payments: list,
    paymentBaseline: job?.paymentBaseline != null && job.paymentBaseline !== "" ? job.paymentBaseline : owed,
    amountWhenBaselined: stamp,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
    payment: latest || null,
  };
  // If invoice total already exceeds a frozen baseline (legacy progress raise),
  // lock baseline to the adjusted owed so later payment edits stay correct.
  if (owed > parseAmount(patch.paymentBaseline) + 0.009) {
    patch.paymentBaseline = owed;
    patch.amountWhenBaselined = inv || owed;
  }
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

/**
 * Update a payment in place, or move it to another job/invoice.
 * Returns { same, patches: [{ jobId, patch }] } or null if the payment is missing.
 * Keeps the same payment id so history / QBO void metadata stay linked.
 */
export function movePayment(fromJob, toJob, payId, entry = {}) {
  if (!fromJob || !payId) return null;
  const fromList = normalizePayments(fromJob);
  const existing = fromList.find((p) => p.id === payId);
  if (!existing) return null;

  const amountRaw = entry.amount != null ? entry.amount : existing.amount;
  const updated = {
    ...existing,
    ...entry,
    id: payId,
    amount: String(parseAmount(amountRaw) || amountRaw || ""),
  };

  const target = toJob || fromJob;
  if (!target?.id || String(target.id) === String(fromJob.id)) {
    return {
      same: true,
      patches: [{ jobId: fromJob.id, patch: updatePayment(fromJob, payId, updated) }],
    };
  }

  const remaining = fromList.filter((p) => p.id !== payId);
  const dest = normalizePayments(target).filter((p) => p.id !== payId).concat(updated);
  return {
    same: false,
    patches: [
      { jobId: fromJob.id, patch: applyPaymentsPatch(fromJob, remaining) },
      { jobId: target.id, patch: applyPaymentsPatch(target, dest) },
    ],
  };
}

/** User-facing payment method (never raw "QBO"). */
export function normalizePaymentMethod(raw, opts = {}) {
  const note = String(opts.note || "").trim();
  const ref = String(opts.ref || "").trim();
  let s = String(raw || "").trim();
  if (note.includes(" — ")) {
    const first = note.split(" — ")[0].trim();
    if (first && first.toLowerCase() !== "sola online payment" && first.toLowerCase() !== "recorded from le pro") {
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