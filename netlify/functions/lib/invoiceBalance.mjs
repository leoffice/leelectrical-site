// Server-side invoice balance math for pay-link refresh (Levi 2026-08-12,
// invoice 251854 showed the customer a stale $2,300 after the invoice changed).
//
// These are VERBATIM ports of the client's balance functions and MUST stay
// byte-for-byte in sync with them (same contract as lib/ovPatch.mjs mirroring
// pro-src/src/data/merge.js). The client files cannot be imported here because
// the prod deploy stage excludes pro-src/. Parity is pinned by
// pro-src/test/invoiceBalance.parity.test.js, which runs both copies against
// the same job matrix.
//
// Sources:
//   parseAmount                      pro-src/src/lib/format.js
//   normalizePayments, totalPaid,
//   isProgressInvoiceJob,
//   frozenBaseline, looksLikeRaisedDraw,
//   amountOwedAtStart, remainingBalance,
//   parseBalanceFromNotes            pro-src/src/lib/payments.js
//   isInvoiceJob, rawBalance,
//   isBalanceExemptOffer, openBalance,
//   invoiceTotal, amountPaid         pro-src/src/lib/customers.js

export function parseAmount(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}

function paymentId() {
  return "pay-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

export function parseBalanceFromNotes(job) {
  const hay = [job?.notes, job?.followUp && job.followUp.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining|still\s*owes?)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  return m ? parseAmount(m[1]) : null;
}

export function normalizePayments(job, opts = {}) {
  const includeDeleted = !!opts.includeDeleted;
  const list = Array.isArray(job?.payments) ? job.payments.map((p) => ({ ...p })) : [];
  const legacy = job?.payment;
  if (legacy && (legacy.amount || legacy.method || legacy.ref)) {
    const lid = legacy.id || "legacy-" + (legacy.date || legacy.ref || "0");
    if (!list.some((p) => p.id === lid)) {
      list.push({ ...legacy, id: lid });
    }
  }
  return list
    .filter((p) => {
      if (!includeDeleted && (p._deleted || p.deletedAt)) return false;
      return parseAmount(p.amount) > 0 || p.method || p.ref;
    })
    .map((p) => ({ ...p, id: p.id || paymentId() }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export function totalPaid(payments) {
  return (payments || []).reduce((s, p) => s + parseAmount(p.amount), 0);
}

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

export function invoiceTotal(job) {
  return parseAmount(job?.amount);
}

function frozenBaseline(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") {
    const locked = parseAmount(job.paymentBaseline);
    // Heal double-counted baselines (openBalance + payment while open still =
    // full invoice total). Simple invoices never owe more than the invoice.
    const inv = invoiceTotal(job);
    if (inv > 0 && locked > inv + 0.009 && !isProgressInvoiceJob(job)) {
      return inv;
    }
    return locked;
  }
  const curOpen =
    job?.openBalance != null && job.openBalance !== "" ? parseAmount(job.openBalance) : null;
  // openBalance reflects payments ALREADY on the job — not the candidate list
  // (which may include newly added rows that have not reduced openBalance yet).
  // Using totalPaid(payments) here double-counted full pays: open $450 + pay $450 → baseline $900.
  const prevPaid = totalPaid(normalizePayments(job));
  if (curOpen != null) {
    if (prevPaid > 0) {
      const inv = invoiceTotal(job);
      // Corrupt: payments on job but openBalance still equals full invoice.
      if (inv > 0 && Math.abs(curOpen - inv) <= 0.01) return inv;
      return curOpen + prevPaid;
    }
    // No prior ledger rows — open balance IS the owed-at-start.
    return curOpen;
  }
  const noteBal = parseBalanceFromNotes(job);
  if (noteBal != null) return noteBal;
  return invoiceTotal(job) || parseAmount(job?.amount) || 0;
}

function looksLikeRaisedDraw(job, inv, baseline, paidSum) {
  if (!(inv > baseline + 0.009)) return false;
  if (isProgressInvoiceJob(job)) return true;
  // Substantial share of the old baseline already collected → treat as prior draw.
  return paidSum > 0 && baseline > 0 && paidSum / baseline >= 0.3;
}

export function amountOwedAtStart(job, payments) {
  const inv = invoiceTotal(job);
  let baseline = frozenBaseline(job, payments);
  const paidSum = totalPaid(payments);

  const stampedRaw = job?.amountWhenBaselined;
  const stamped =
    stampedRaw != null && stampedRaw !== "" ? parseAmount(stampedRaw) : null;

  if (stamped != null && inv > 0 && Math.abs(inv - stamped) > 0.009) {
    // Invoice total changed since baseline was set — shift owed by the same delta.
    baseline = Math.max(0, baseline + (inv - stamped));
  } else if (
    stamped != null &&
    inv > 0 &&
    Math.abs(inv - stamped) <= 0.009 &&
    looksLikeRaisedDraw(job, inv, baseline, paidSum)
  ) {
    // Corrupt stamp: amountWhenBaselined was written to the NEW total without
    // bumping paymentBaseline (agent draft / partial save / race). Promote so
    // balance due = invoice − paid instead of freezing at the old draw.
    baseline = inv;
  } else if (stamped == null && inv > 0 && baseline > 0 && looksLikeRaisedDraw(job, inv, baseline, paidSum)) {
    // Legacy: invoice total raised after paymentBaseline was frozen (progress draw
    // 50%→80%). Promote to invoice total when this looks like a full prior draw,
    // not a QBO import where amount ≫ open balance with little of that baseline paid.
    baseline = inv;
  }

  return baseline;
}

export function remainingBalance(job, payments) {
  const owed = amountOwedAtStart(job, payments);
  return Math.max(0, owed - totalPaid(payments));
}

export function isInvoiceJob(job) {
  return !!(job && String(job.invoiceNo || "").trim());
}

export function rawBalance(job) {
  if (!job) return 0;
  const pays = normalizePayments(job);
  const hasExplicitOpen = job.openBalance != null && job.openBalance !== "";
  const storedOpen = hasExplicitOpen ? parseAmount(job.openBalance) : null;
  const inv = parseAmount(job.amount);
  const paidSum = pays.length ? totalPaid(pays) : 0;
  const baseline =
    job.paymentBaseline != null && job.paymentBaseline !== ""
      ? parseAmount(job.paymentBaseline)
      : null;

  // QBO sync often marks paid (openBalance 0) without refreshing the payment
  // ledger. Incomplete payments would still show a remainder — trust zero.
  // Exception: invoice total was raised after a full-pay stamp (progress draw /
  // line edits) — then balance due is invoice − paid, not frozen zero.
  if (hasExplicitOpen && storedOpen <= 0.01) {
    if (pays.length) {
      const fromPays = remainingBalance(job, pays);
      if (fromPays > 0.01) {
        const raisedAfterPay =
          inv > paidSum + 0.01 &&
          (isProgressInvoiceJob(job) ||
            (baseline != null && inv > baseline + 0.01) ||
            (job.amountWhenBaselined != null &&
              job.amountWhenBaselined !== "" &&
              Math.abs(parseAmount(job.amountWhenBaselined) - inv) <= 0.01 &&
              baseline != null &&
              inv > baseline + 0.01));
        if (raisedAfterPay) return fromPays;
        // Stale zero openBalance while ledger still shows a remainder and the
        // job is not marked paid (Amos Cohen / 231504: $25k paid of $30k).
        if (!job.paid && inv > 0.01 && paidSum + 0.01 < inv) return fromPays;
      }
    }
    // Stale openBalance:0 while notes/follow-up still say money is owed.
    // Do not invent balance when job.paid (true QBO paid mark).
    if (!job.paid) {
      const noteBal = parseBalanceFromNotes(job);
      if (noteBal != null && noteBal > 0.01) {
        if (pays.length && inv > 0.01 && paidSum + 0.01 < inv) {
          return Math.max(0, inv - paidSum);
        }
        return noteBal;
      }
      const hay = [job.notes, job.followUp && job.followUp.text].filter(Boolean).join(" ");
      const cm = hay.match(
        /(?:collect|open\s*balance|still\s*owes?|balance\s*due)\D{0,12}\$?\s*([\d,]+(?:\.\d+)?)/i
      );
      if (cm) {
        const n = parseAmount(cm[1]);
        if (n > 0.01 && inv > 0.01 && n + 0.01 < inv) return n;
      }
    }
    return 0;
  }

  if (pays.length) {
    const fromPays = remainingBalance(job, pays);
    if (!hasExplicitOpen) return fromPays;
    // Payment ledger says more owed than openBalance:
    // - Progress draw raised after payments → trust payments (invoice − paid)
    // - QBO already applied a payment the local list missed → trust openBalance
    if (fromPays > storedOpen + 0.009) {
      const progressLike =
        isProgressInvoiceJob(job) ||
        (baseline != null &&
          inv > baseline + 0.009 &&
          paidSum > 0 &&
          paidSum / Math.max(baseline, 1) >= 0.3);
      if (progressLike) return fromPays;
      return Math.max(0, storedOpen);
    }
    return fromPays;
  }
  if (hasExplicitOpen) {
    // Progress invoice total raised with no payment ledger — balance tracks amount.
    if (isProgressInvoiceJob(job)) {
      if (inv > storedOpen + 0.009) return inv;
    }
    return storedOpen;
  }
  const hay = [job.notes, job.followUp && job.followUp.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining|still\s*owes?)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseAmount(m[1]);
  return job.paid ? 0 : parseAmount(job.amount);
}

export function isBalanceExemptOffer(job) {
  if (!job || job.paid) return false;
  // Customer paid something → stop hiding the invoice from records / open list
  const pays = normalizePayments(job);
  if (pays.some((p) => parseAmount(p?.amount) > 0.009)) return false;
  if (job.excludeFromBalanceDue || job._balanceExempt) return true;
  const pr = job.permitRenew || job.permitRenewMock;
  if (!pr || typeof pr !== "object") return false;
  if (pr.excludeFromBalanceDue || pr.provisional) return true;
  // Phase A mock renews default to exempt while unpaid
  if (pr.mock || pr.phase === "A" || pr.phase === 1) return true;
  return false;
}

export function openBalance(job) {
  if (!job) return 0;
  if (!isInvoiceJob(job)) return 0;
  if (isBalanceExemptOffer(job)) return 0;
  return rawBalance(job);
}

export function amountPaid(job) {
  if (!job) return 0;
  // Estimates never carry payments in any balance sense — and since their
  // openBalance is now $0, the `total - due` inference below would wrongly
  // report the whole estimate as "paid". Gate on being an actual invoice.
  if (!isInvoiceJob(job)) return 0;
  const total = invoiceTotal(job);
  const hasExplicitOpen = job.openBalance != null && job.openBalance !== "";
  const storedOpen = hasExplicitOpen ? parseAmount(job.openBalance) : null;
  const pays = normalizePayments(job);
  const sum = pays.length ? totalPaid(pays) : 0;
  // Provisional unpaid renew: openBalance is $0 for TOTAL DUE rollup only.
  // Never invent "paid $365" from total − $0 due (LE-2703, Levi 2026-08-11).
  if (isBalanceExemptOffer(job) && !job.paid) {
    return sum;
  }
  // Live due (heals raised-after-pay stamps). Prefer ledger when still open.
  const due = openBalance(job);
  if (due > 0.01 && pays.length) return sum;
  // Fully paid in QBO/sync even when the local payment list is incomplete.
  if (
    due <= 0.01 &&
    ((job.paid && (!hasExplicitOpen || storedOpen <= 0.01)) ||
      (hasExplicitOpen && storedOpen <= 0.01))
  ) {
    // Incomplete ledger + true full-pay: inflate to invoice total.
    // Raised-after-pay with open due is handled above (returns sum).
    return Math.max(sum, total || parseAmount(job.payment?.amount) || 0);
  }
  if (pays.length) return sum;
  if (job.paid && (job.openBalance == null || job.openBalance === "" || parseAmount(job.openBalance) === 0)) {
    return total || parseAmount(job.payment?.amount);
  }
  if (total > 0 && due >= 0 && due <= total) return total - due;
  return parseAmount(job.payment?.amount);
}
