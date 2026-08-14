// Multi-invoice payment apply: allocate one payment across open invoices.
// Levi 2026-08-06 (Amos Cohen $9,600): choose invoices + amount per line;
// applied amounts must sum to the payment total.
import { openBalance, amountPaid } from "./customers.js";
import { fmt$, parseAmount } from "./format.js";
import { formatInvoicePayOption } from "./customerDocLists.js";

/** Round money to cents. */
export function money2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Sum of allocation map values (jobId → amount). */
export function sumAllocations(allocs) {
  if (!allocs || typeof allocs !== "object") return 0;
  return money2(
    Object.values(allocs).reduce((s, v) => s + parseAmount(v), 0)
  );
}

/**
 * Auto-fill per-invoice amounts so they sum to `total` (or less if open
 * balances are smaller). Prefers `preferJobId` first, then higher open balance.
 * Returns { [jobId]: number } for every job in `invoices` (0 when unused).
 */
export function autoAllocatePayment(invoices, total, { preferJobId = "" } = {}) {
  const list = (invoices || []).filter((j) => j && j.id);
  const totalAmt = money2(parseAmount(total));
  const out = {};
  for (const j of list) out[j.id] = 0;
  if (!(totalAmt > 0.009) || !list.length) return out;

  const prefer = String(preferJobId || "");
  const sorted = list.slice().sort((a, b) => {
    if (prefer) {
      const ap = String(a.id) === prefer ? 0 : 1;
      const bp = String(b.id) === prefer ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return openBalance(b) - openBalance(a);
  });

  let remaining = totalAmt;
  for (const j of sorted) {
    if (remaining <= 0.009) break;
    const due = money2(openBalance(j));
    if (due <= 0.009) continue;
    const apply = money2(Math.min(due, remaining));
    out[j.id] = apply;
    remaining = money2(remaining - apply);
  }
  return out;
}

/**
 * Lines with a real apply amount (> 0.009).
 * @returns {{ job, amount: number }[]}
 */
export function allocationLines(invoices, allocs) {
  const map = allocs || {};
  const lines = [];
  for (const j of invoices || []) {
    if (!j?.id) continue;
    const amount = money2(parseAmount(map[j.id]));
    if (amount > 0.009) lines.push({ job: j, amount });
  }
  return lines;
}

/**
 * Validate multi-invoice apply before Record.
 * @returns {{ ok: boolean, error?: string, applied: number, unallocated: number, lines: {job, amount}[] }}
 */
export function validatePaymentAllocations(invoices, allocs, total) {
  const totalAmt = money2(parseAmount(total));
  const lines = allocationLines(invoices, allocs);
  const applied = money2(lines.reduce((s, l) => s + l.amount, 0));
  const unallocated = money2(totalAmt - applied);

  if (!(totalAmt > 0.009)) {
    return { ok: false, error: "Enter a payment amount", applied, unallocated, lines };
  }
  if (!lines.length) {
    return {
      ok: false,
      error: "Choose at least one invoice and how much to apply",
      applied,
      unallocated,
      lines,
    };
  }
  for (const line of lines) {
    const due = money2(openBalance(line.job));
    if (line.amount > due + 0.011) {
      const no = line.job.invoiceNo || line.job.id;
      return {
        ok: false,
        error: "Amount on #" + no + " exceeds open balance",
        applied,
        unallocated,
        lines,
      };
    }
  }
  if (applied > totalAmt + 0.011) {
    return {
      ok: false,
      error: "Applied amounts exceed the payment total",
      applied,
      unallocated,
      lines,
    };
  }
  if (Math.abs(applied - totalAmt) > 0.011) {
    return {
      ok: false,
      error:
        "Applied " +
        applied.toFixed(2) +
        " must equal payment " +
        totalAmt.toFixed(2) +
        " — adjust the invoice amounts",
      applied,
      unallocated,
      lines,
    };
  }
  return { ok: true, applied, unallocated: 0, lines };
}

/** Picker line with prior paid total (multi-invoice clarity). */
export function formatInvoiceApplyLine(job) {
  const base = formatInvoicePayOption(job);
  const paid = amountPaid(job);
  if (paid > 0.01) {
    return base + " · paid so far " + (fmt$(paid) || ("$" + paid.toFixed(2)));
  }
  return base;
}

/** Shared group id for one payment split across invoices. */
export function paymentGroupId() {
  return "paygrp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}
