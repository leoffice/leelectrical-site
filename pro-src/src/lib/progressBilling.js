// Progress / partial invoice billing — matches QuickBooks (fractional qty × full rate).
import { parseAmount } from "./format.js";
import { emptyLine, lineAmount, linesTotal } from "./qboDoc.js";

const QTY_PRECISION = 7;

export function roundQty(q) {
  return Math.round(q * 10 ** QTY_PRECISION) / 10 ** QTY_PRECISION;
}

export function isFractionalProgressQty(qty) {
  const q = parseAmount(qty);
  return q > 0 && q < 0.9999;
}

/** True when invoice should use progress-billing UI (linked estimate / partial invoice). */
/**
 * Both spellings mean "this invoice is being built out of the estimate".
 * `from_estimate` comes from the Create-invoice picker, `turn_from_estimate`
 * from Convert to invoice — they must behave identically, and not doing so is
 * what made Convert collapse to one generic line (Levi 2026-07-28).
 */
export function isFromEstimateMode(mode) {
  return mode === "from_estimate" || mode === "turn_from_estimate";
}

export function isProgressBillingContext(job, { kind, mode } = {}) {
  if (kind !== "invoice") return false;
  if (isFromEstimateMode(mode)) return true;
  if (mode !== "edit") return false;
  if (job.estimateLines?.length) return true;
  if (parseAmount(job.contractAmount) > 0) return true;
  if (job.invoiceProgressBilling) return true;
  if ((job.invoiceLines || []).some((ln) => isFractionalProgressQty(ln.qty))) return true;
  if (job.invoiceNo && job.status?.Estimate?.s === "done" && job.status?.Accepted?.s === "done") return true;
  return false;
}

export function contractTotalFromEstimate(estimateLines) {
  return linesTotal(estimateLines || []);
}

export function contractTotalForJob(job) {
  const fromEstimate = contractTotalFromEstimate(job.estimateLines);
  if (fromEstimate > 0) return fromEstimate;
  return parseAmount(job.contractAmount) || 0;
}

export function progressPctFromLines(lines, contractTotal) {
  const contract = parseAmount(contractTotal) || 0;
  if (!contract) return 100;
  const billed = linesTotal(lines);
  return Math.min(100, Math.max(0, Math.round((billed / contract) * 10000) / 100));
}

/** QBO-style: keep full rate, scale qty by progress percent. */
/** Unit price from app lines (unitPrice) or office-file import (rate). */
export function lineUnitPrice(ln) {
  return parseAmount(ln?.unitPrice) || parseAmount(ln?.rate) || 0;
}

/**
 * Full (100%) line quantity for progress math.
 * Never use an already-progress-scaled qty as the base — setting 100% after 75%
 * used to keep qty 0.75 (Levi 2026-08-05: still shows 75% after Save).
 */
export function fullLineQty(ln) {
  const orig = parseAmount(ln?.contractQty ?? ln?.originalQty ?? ln?.fullQty);
  if (orig > 0) return orig;
  const q = parseAmount(ln?.qty) || 1;
  // Progress-billed fractional qty (0.75) means 75% of one unit of work.
  if (ln?.progressBilling && q > 0 && q < 1) return 1;
  if (q > 0 && q < 1) return 1;
  return q || 1;
}

export function progressBillLines(estimateLines, progressPct) {
  const pct = Math.min(100, Math.max(0, parseAmount(progressPct))) / 100;
  return (estimateLines || []).map((ln) => {
    const baseQty = fullLineQty(ln);
    const rate = lineUnitPrice(ln);
    const qty = pct >= 1 ? baseQty : roundQty(baseQty * pct);
    // Always keep amount in lockstep with qty × rate (Seewald 231595: qty 0.63 with
    // amount/rate out of sync produced a $16k invoice total).
    const amount = Math.round(qty * rate * 100) / 100;
    return {
      ...emptyLine(),
      ...ln,
      qty,
      unitPrice: rate,
      rate,
      amount,
      progressBilling: pct < 1,
      // Remember full qty so a later 50%→100% edit does not compound.
      contractQty: baseQty,
    };
  });
}

/** Set progress by dollar amount due (split across estimate lines proportionally). */
export function progressBillByAmount(estimateLines, amountDue, contractTotal) {
  const contract = parseAmount(contractTotal) || contractTotalFromEstimate(estimateLines);
  if (!contract) return progressBillLines(estimateLines, 100);
  const pct = (parseAmount(amountDue) / contract) * 100;
  return progressBillLines(estimateLines, pct);
}

/**
 * Match invoice lines to contract/estimate template by item name when possible
 * so a deleted estimate line is not used as the rate source for a different row.
 */
function templateLineFor(ln, i, template) {
  const key = lineItemKey(ln);
  if (key && template?.length) {
    const hit = template.find((t) => lineItemKey(t) === key);
    if (hit) return hit;
  }
  return template?.[i] || template?.[0] || ln;
}

/** Apply progress percent to existing invoice lines (preserve item names / count). */
export function applyProgressPctToLines(lines, contractLines, progressPct) {
  const template = contractLines?.length ? contractLines : lines;
  // Scale each remaining invoice line only — never re-insert deleted estimate rows.
  return (lines || []).map((ln, i) => {
    const base = templateLineFor(ln, i, template);
    const scaled = progressBillLines([base], progressPct)[0] || ln;
    return {
      ...ln,
      qty: scaled.qty,
      unitPrice: scaled.unitPrice,
      amount: scaled.amount,
      progressBilling: scaled.progressBilling,
      contractQty: scaled.contractQty ?? ln.contractQty,
    };
  });
}

/** Apply a total due amount across lines (QBO fractional qty). */
export function applyDueAmountToLines(lines, contractLines, amountDue, contractTotal) {
  const template = contractLines?.length ? contractLines : lines;
  const rows = lines || [];
  if (!rows.length) return rows;
  // Proportionally bill only the lines still on the invoice.
  const orderedTemplate = rows.map((ln, i) => templateLineFor(ln, i, template));
  const subContract =
    contractTotalFromEstimate(orderedTemplate) || parseAmount(contractTotal) || 0;
  const billed = progressBillByAmount(orderedTemplate, amountDue, subContract || contractTotal);
  return rows.map((ln, i) => {
    const ref = billed[i] || billed[0] || ln;
    return {
      ...ln,
      qty: ref.qty,
      unitPrice: ref.unitPrice,
      amount: ref.amount,
      progressBilling: ref.progressBilling,
      contractQty: ref.contractQty ?? ln.contractQty,
    };
  });
}

/** Stable item key for matching invoice lines to estimate template lines. */
function lineItemKey(ln) {
  return String(ln?.itemName || "")
    .trim()
    .toLowerCase();
}

/**
 * Coerce invoice lines into QBO progress style: full rate × fractional qty.
 * Fixes imports where unitPrice was the partial bill and qty was 1 (reads as 100% of a small rate).
 *
 * CRITICAL (Levi 2026-08-14 — Izzy invoice): never re-expand from the full
 * estimate when the invoice deliberately has a subset of estimate lines
 * (e.g. user deleted "Removal & disposal"). Deleted lines must stay gone.
 */
export function normalizeProgressInvoiceLines(lines, contractTotal, estimateLines) {
  const contract = parseAmount(contractTotal) || 0;
  const rows = (lines || []).map((ln) => ({ ...emptyLine(), ...ln }));
  if (!rows.length) return rows;

  // Prefer estimate template when billed total is a partial of the contract —
  // but only rebuild from estimate lines the invoice still carries.
  if (estimateLines?.length && contract > 0) {
    const billed = linesTotal(rows);
    if (billed > 0 && billed < contract * 0.999) {
      const invKeys = rows.map(lineItemKey);
      const estKeys = estimateLines.map(lineItemKey);
      const invIsSubsetOfEstimate =
        invKeys.length > 0 &&
        invKeys.every((k) => k && estKeys.includes(k)) &&
        invKeys.length < estKeys.length;
      const invMatchesEstimate =
        invKeys.length === estKeys.length &&
        invKeys.length > 0 &&
        invKeys.every((k, i) => k && k === estKeys[i]);

      if (invIsSubsetOfEstimate) {
        // Keep invoice line set; pull rates from matching estimate lines only.
        const byKey = new Map();
        for (const el of estimateLines) {
          const k = lineItemKey(el);
          if (k && !byKey.has(k)) byKey.set(k, el);
        }
        const template = invKeys.map((k) => byKey.get(k)).filter(Boolean);
        if (template.length === rows.length) {
          const subContract = contractTotalFromEstimate(template) || contract;
          return progressBillByAmount(template, billed, subContract);
        }
        // Fall through — scale existing rows without re-adding deleted ones.
      } else if (invMatchesEstimate || rows.length === 1) {
        // Full match, or classic single-line partial import → estimate template OK.
        // (Single custom line with no estimate name match still uses estimate rebuild.)
        if (invMatchesEstimate || !lineItemKey(rows[0]) || estKeys.includes(lineItemKey(rows[0]))) {
          return progressBillByAmount(estimateLines, billed, contract);
        }
      }
    }
  }

  // Single line: qty≈1 and rate equals partial bill under full contract → flip to fractional qty.
  if (rows.length === 1 && contract > 0) {
    const ln = rows[0];
    const qty = parseAmount(ln.qty);
    const rate = lineUnitPrice(ln);
    const amt = lineAmount(ln);
    if (isFractionalProgressQty(qty) && rate > 0) {
      return [{ ...ln, unitPrice: rate, progressBilling: true }];
    }
    if (qty >= 0.999 && rate > 0 && rate < contract * 0.999 && amt > 0 && amt <= contract) {
      return [
        {
          ...ln,
          unitPrice: contract,
          qty: roundQty(amt / contract),
          progressBilling: true,
        },
      ];
    }
  }

  // Multi-line already fractional — keep rates, mark progress.
  return rows.map((ln) => {
    const qty = parseAmount(ln.qty);
    const rate = lineUnitPrice(ln);
    if (isFractionalProgressQty(qty) && rate > 0) {
      return { ...ln, unitPrice: rate, progressBilling: true };
    }
    return ln;
  });
}

/** Seed invoice lines for edit when none saved locally (e.g. QBO-imported job). */
export function inferProgressInvoiceLines(job) {
  const due = parseAmount(job.amount);
  const contract = contractTotalForJob(job);
  const title = (job.title || "").trim();
  const itemName = title.split("\n")[0].slice(0, 80) || "General electrical work";

  if (job.estimateLines?.length) {
    if (due > 0 && contract > due) {
      return progressBillByAmount(job.estimateLines, due, contract);
    }
    return job.estimateLines.map((ln) => ({ ...emptyLine(), ...ln }));
  }

  if (contract > 0 && due > 0 && due < contract) {
    const qty = roundQty(due / contract);
    return [
      {
        ...emptyLine(),
        itemName,
        description: title,
        qty,
        unitPrice: contract,
        progressBilling: true,
      },
    ];
  }

  if (due > 0) {
    return [{ ...emptyLine(), itemName, description: title, qty: 1, unitPrice: due }];
  }
  return [emptyLine()];
}

export function progressBillingJobPatch(lines, job, { progressPct, contractAmount } = {}) {
  const contract = contractTotalForJob({ ...job, contractAmount }) || linesTotal(lines);
  const pct = progressPct != null ? parseAmount(progressPct) : progressPctFromLines(lines, contract);
  const patch = {
    invoiceProgressBilling: pct < 99.99 || (lines || []).some((ln) => isFractionalProgressQty(ln.qty)),
    invoiceProgressPct: pct,
  };
  if (contract > 0 && !job.estimateLines?.length) {
    patch.contractAmount = contract;
  }
  return patch;
}

export function dueFromContract(contractTotal, progressPct) {
  const contract = parseAmount(contractTotal) || 0;
  const pct = Math.min(100, Math.max(0, parseAmount(progressPct))) / 100;
  return Math.round(contract * pct * 100) / 100;
}

export function syncLineQtyFromDue(line, contractRate, amountDue) {
  const rate = parseAmount(contractRate) || parseAmount(line.unitPrice) || 0;
  if (!rate) return line;
  return { ...line, unitPrice: rate, qty: roundQty(parseAmount(amountDue) / rate), progressBilling: true };
}

export function lineDueAmount(line) {
  return lineAmount(line);
}