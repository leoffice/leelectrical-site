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
export function isProgressBillingContext(job, { kind, mode } = {}) {
  if (kind !== "invoice") return false;
  if (mode === "from_estimate" || mode === "turn_from_estimate") return true;
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

export function progressBillLines(estimateLines, progressPct) {
  const pct = Math.min(100, Math.max(0, parseAmount(progressPct))) / 100;
  return (estimateLines || []).map((ln) => {
    const baseQty = parseAmount(ln.qty) || 1;
    const rate = lineUnitPrice(ln);
    return {
      ...emptyLine(),
      ...ln,
      qty: pct >= 1 ? baseQty : roundQty(baseQty * pct),
      unitPrice: rate,
      progressBilling: pct < 1,
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

/** Apply progress percent to existing invoice lines (preserve item names). */
export function applyProgressPctToLines(lines, contractLines, progressPct) {
  const template = contractLines?.length ? contractLines : lines;
  const billed = progressBillLines(template, progressPct);
  return (lines || []).map((ln, i) => {
    const ref = billed[i] || billed[0] || ln;
    return { ...ln, qty: ref.qty, unitPrice: ref.unitPrice, progressBilling: ref.progressBilling };
  });
}

/** Apply a total due amount across lines (QBO fractional qty). */
export function applyDueAmountToLines(lines, contractLines, amountDue, contractTotal) {
  const template = contractLines?.length ? contractLines : lines;
  const billed = progressBillByAmount(template, amountDue, contractTotal);
  return (lines || []).map((ln, i) => {
    const ref = billed[i] || billed[0] || ln;
    return { ...ln, qty: ref.qty, unitPrice: ref.unitPrice, progressBilling: ref.progressBilling };
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