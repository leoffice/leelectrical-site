// QuickBooks estimate/invoice payloads — line items, ShipAddr, progress billing.
import { parseAmount, fmt$ } from "./format.js";
import { effectiveServiceAddress } from "./customerSync.js";
import { preferredChangeOrderDocNo } from "./changeOrder.js";
import {
  inferProgressInvoiceLines,
  isProgressBillingContext,
  progressBillLines,
  progressPctFromLines,
  contractTotalForJob,
} from "./progressBilling.js";

export function emptyLine() {
  return { itemName: "", itemId: "", description: "", qty: 1, unitPrice: 0 };
}

export function lineAmount(line) {
  const q = parseAmount(line.qty) || 0;
  const p = parseAmount(line.unitPrice) || parseAmount(line.rate) || 0;
  return Math.round(q * p * 100) / 100;
}

export function linesTotal(lines) {
  return (lines || []).reduce((s, ln) => s + lineAmount(ln), 0);
}

/** Scale estimate lines by progress % (e.g. 50% deposit invoice). */
export function scaleLines(lines, progressPct) {
  const pct = Math.min(100, Math.max(0, parseAmount(progressPct))) / 100;
  if (!pct || pct >= 1) return (lines || []).map((ln) => ({ ...ln }));
  return (lines || []).map((ln) => ({
    ...ln,
    qty: ln.qty,
    unitPrice: Math.round(parseAmount(ln.unitPrice) * pct * 100) / 100,
    description: (ln.description || "") + (pct < 1 ? ` (${progressPct}% progress)` : ""),
  }));
}

export function initialLines(job, { kind, mode, progressPct } = {}) {
  const saved = kind === "estimate" ? job.estimateLines : job.invoiceLines;
  if (saved && saved.length) {
    if (kind === "invoice" && mode === "from_estimate" && job.estimateLines) {
      return progressBillLines(job.estimateLines, progressPct ?? 100);
    }
    return saved.map((ln) => ({ ...emptyLine(), ...ln }));
  }
  if (kind === "invoice" && mode === "edit" && isProgressBillingContext(job, { kind, mode })) {
    return inferProgressInvoiceLines(job);
  }
  if (kind === "invoice" && mode === "from_estimate" && job.estimateLines && job.estimateLines.length) {
    return progressBillLines(job.estimateLines, progressPct ?? 50);
  }
  const amt = parseAmount(job.amount);
  if (amt > 0) {
    return [{ itemName: "General electrical work", description: job.title || "", qty: 1, unitPrice: amt }];
  }
  return [emptyLine()];
}

export function shipAddrPayload(serviceAddress, apartment) {
  const line1 = String(serviceAddress || "").trim();
  const line2 = String(apartment || "").trim();
  const addr = { Line1: line1 };
  if (line2) addr.Line2 = line2;
  return addr;
}

/** Command payload for create_estimate / create_invoice (host → QBO API). */
export function buildDocCommandPayload(job, { kind, lines, serviceAddress, apartment, mode, progressPct, send, recurring }) {
  const total = linesTotal(lines);
  const base = {
    customer: job.customer || job.businessName || "",
    businessName: job.businessName || job.customer || "",
    qboCustomerId: job.qboCustomerId || "",
    email: job.email || "",
    personName: job.personName || "",
    jobTitle: job.title || "",
    serviceAddress: serviceAddress || effectiveServiceAddress(job),
    apartment: apartment || job.apartment || "",
    shipAddr: shipAddrPayload(serviceAddress || effectiveServiceAddress(job), apartment || job.apartment),
    lines: (lines || []).map((ln) => ({
      itemName: ln.itemName || "",
      itemId: ln.itemId || "",
      description: ln.description || "",
      qty: parseAmount(ln.qty) || 1,
      unitPrice: parseAmount(ln.unitPrice) || 0,
      amount: lineAmount(ln),
    })),
    total,
    totalFormatted: fmt$(total),
    attachments: [],
    send: !!send,
  };
  if (kind === "invoice") {
    // Change-order invoices: original invoice # + -CO- + seq (e.g. 251100-CO-1).
    base.invoiceNo =
      String(job.invoiceNo || "").trim() || preferredChangeOrderDocNo(job, "invoice") || "";
    base.source = mode === "from_estimate" || mode === "turn_from_estimate" ? "estimate" : "new";
    base.estimateNo = job.estimateNo || "";
    const contract = contractTotalForJob(job);
    base.progressPct =
      progressPct != null
        ? parseAmount(progressPct)
        : contract > 0
        ? progressPctFromLines(lines, contract)
        : 100;
    base.progressBilling = base.progressPct < 99.99;
    if (recurring) base.recurring = recurring;
  }
  if (kind === "estimate") {
    base.estimateNo =
      String(job.estimateNo || "").trim() || preferredChangeOrderDocNo(job, "estimate") || "";
  }
  return base;
}

export function docIdempotencyKey(kind, jobId, lines, mode) {
  const sig = (lines || [])
    .map((ln) => [ln.itemName, ln.qty, ln.unitPrice].join(":"))
    .join("|")
    .slice(0, 80);
  const prefix =
    mode === "edit"
      ? kind === "estimate"
        ? "update_estimate:"
        : "update_invoice:"
      : kind === "estimate"
      ? "create_estimate:"
      : "create_invoice:";
  return prefix + jobId + ":" + sig;
}