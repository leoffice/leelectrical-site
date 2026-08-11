// Bi-directional estimate ↔ invoice sync — shared address fields + QBO update commands.
import { fmt$, todayStr, parseAmount } from "./format.js";
import {
  buildDocCommandPayload,
  docIdempotencyKey,
  emptyLine,
  lineAmount,
  linesTotal,
} from "./qboDoc.js";
import { buildRecurringPayload, recurringIdempotencyKey } from "./recurringBilling.js";
import {
  isFractionalProgressQty,
  isProgressBillingContext,
  progressBillLines,
  progressBillingJobPatch,
  progressPctFromLines,
  contractTotalForJob,
} from "./progressBilling.js";
import { briefTitlePatch, preferredChangeOrderDocNo } from "./changeOrder.js";
import { reconcileBalanceOnAmountChange } from "./payments.js";
import { discountJobPatch, docFaceTotal, docTotalAfterDiscount } from "./docDiscount.js";

export const DOC_SYNC_COMMAND_TYPES = [
  "create_estimate",
  "create_invoice",
  "create_recurring_invoice",
  "update_estimate",
  "update_invoice",
];

/** True when any estimate/invoice doc command is still syncing for this job. */
export function docSyncPendingForJob(commands, jobId) {
  return (commands || []).some(
    (c) =>
      String(c.jobId) === String(jobId) &&
      DOC_SYNC_COMMAND_TYPES.includes(c.type) &&
      (c.status === "queued" || c.status === "working")
  );
}

const ESTIMATE_DOC_TYPES = ["create_estimate", "update_estimate"];
const INVOICE_DOC_TYPES = ["create_invoice", "update_invoice"];

/** True when a recent doc sync failed and the job still has no confirmed doc number. */
export function docSyncFailedForJob(commands, jobId, kind, job) {
  const types = kind === "estimate" ? ESTIMATE_DOC_TYPES : INVOICE_DOC_TYPES;
  const hasDoc =
    kind === "estimate"
      ? !!(job?.estimateNo || job?._estimateConfirmed)
      : !!(job?.invoiceNo || job?._invoiceConfirmed);
  if (hasDoc) return false;
  return (commands || []).some(
    (c) =>
      String(c.jobId) === String(jobId) &&
      types.includes(c.type) &&
      c.status === "failed"
  );
}

export function sharedAddressFields(serviceAddress, apartment) {
  return {
    serviceAddress,
    apartment,
    address: serviceAddress,
  };
}

function cloneLines(lines) {
  return (lines || []).map((ln) => ({ ...emptyLine(), ...ln }));
}

/** Normalize rates/qty so a typed "$9,200" rate cannot save as a string and later re-seed wrong. */
export function normalizeDocLines(lines) {
  return (lines || []).map((ln) => {
    const row = { ...emptyLine(), ...ln };
    const qtyRaw = row.qty;
    const hasQty = qtyRaw != null && qtyRaw !== "";
    const qty = hasQty ? parseAmount(qtyRaw) : 1;
    const unitPrice = parseAmount(row.unitPrice) || parseAmount(row.rate) || 0;
    const amount = Math.round((hasQty ? qty : 1) * unitPrice * 100) / 100 || lineAmount(row);
    return {
      ...row,
      qty: hasQty ? qty : row.qty == null ? 1 : row.qty,
      unitPrice,
      rate: unitPrice,
      amount,
    };
  });
}

function statusPatch(kind) {
  return kind === "estimate"
    ? { Estimate: { s: "done", d: todayStr() } }
    : { Invoiced: { s: "done", d: todayStr() } };
}

/** Revert optimistic pipeline step when a QuickBooks doc sync fails. */
export function docSyncFailurePatch(commandType) {
  const t = String(commandType || "");
  return t.includes("estimate")
    ? { status: { Estimate: { s: "", d: "" } } }
    : { status: { Invoiced: { s: "", d: "" } } };
}

/**
 * Jobs that carry an invoice linked to this estimate (same job or sibling by est #).
 * Goodness case: est lives on qbo-est-201963, 50% inv on local-… with same estimateNo.
 */
export function findJobsLinkedToEstimate(jobs, estimateJob) {
  if (!estimateJob) return [];
  const estId = String(estimateJob.id || "");
  const estNo = String(estimateJob.estimateNo || "").trim();
  const out = [];
  const seen = new Set();
  for (const j of jobs || []) {
    if (!j || !j.id) continue;
    const id = String(j.id);
    if (seen.has(id)) continue;
    const hasInv =
      !!(String(j.invoiceNo || "").trim() || j._invoiceConfirmed || (j.invoiceLines && j.invoiceLines.length));
    if (!hasInv) continue;
    const sameJob = id === estId;
    const sameEstNo = estNo && String(j.estimateNo || "").trim() === estNo;
    const linked =
      String(j.linkedEstimateJobId || "") === estId ||
      String(estimateJob.linkedInvoiceJobId || "") === id ||
      String(estimateJob.linkedInvoiceNo || "") === String(j.invoiceNo || "").trim();
    if (sameJob || sameEstNo || linked) {
      seen.add(id);
      out.push(j);
    }
  }
  return out;
}

/**
 * When the estimate contract changes, keep linked progress invoices on the same %.
 * e.g. est $4,600→$9,200 at 50% → invoice due becomes $4,600 (still 50%).
 * Paid dollars stay; open balance recomputes.
 */
export function planInvoicePatchFromEstimateUpdate(invoiceJob, estimateLines, opts = {}) {
  const estLines = normalizeDocLines(estimateLines);
  const contract = linesTotal(estLines);
  if (!(contract > 0) || !invoiceJob) return null;

  const priorContract =
    contractTotalForJob(invoiceJob) ||
    linesTotal(invoiceJob.estimateLines) ||
    parseAmount(invoiceJob.contractAmount) ||
    0;
  const priorLines = invoiceJob.invoiceLines || [];
  const explicitPct =
    opts.progressPct != null && opts.progressPct !== ""
      ? parseAmount(opts.progressPct)
      : invoiceJob.invoiceProgressPct != null && invoiceJob.invoiceProgressPct !== ""
        ? parseAmount(invoiceJob.invoiceProgressPct)
        : null;
  const derivedPct =
    priorContract > 0
      ? progressPctFromLines(priorLines, priorContract)
      : progressPctFromLines(priorLines, contract);
  const isProgress =
    !!invoiceJob.invoiceProgressBilling ||
    (explicitPct != null && explicitPct < 99.99) ||
    (derivedPct > 0 && derivedPct < 99.99) ||
    priorLines.some((ln) => ln?.progressBilling || isFractionalProgressQty(ln?.qty));

  // Full non-progress invoice: replace lines with the new estimate (1:1).
  if (!isProgress) {
    const invLines = estLines.map((ln) => ({ ...ln, progressBilling: false }));
    const total = linesTotal(invLines);
    return {
      estimateLines: cloneLines(estLines),
      contractAmount: contract,
      invoiceLines: invLines,
      invoiceProgressBilling: false,
      invoiceProgressPct: 100,
      amount: fmt$(total),
      ...reconcileBalanceOnAmountChange(invoiceJob, total),
    };
  }

  const pct =
    explicitPct != null && !Number.isNaN(explicitPct)
      ? Math.min(100, Math.max(0, explicitPct))
      : Math.min(100, Math.max(0, derivedPct || 100));
  const invLines = progressBillLines(estLines, pct);
  const total = linesTotal(invLines);
  return {
    estimateLines: cloneLines(estLines),
    contractAmount: contract,
    invoiceLines: invLines,
    invoiceProgressBilling: pct < 99.99,
    invoiceProgressPct: pct,
    amount: fmt$(total),
    ...reconcileBalanceOnAmountChange(
      { ...invoiceJob, invoiceProgressBilling: true, invoiceProgressPct: pct },
      total
    ),
  };
}

/**
 * Estimate save → patches for every linked invoice job (including same-id).
 * Returns [{ jobId, patch, progressPct, invoiceNo }].
 */
export function planLinkedInvoicePatchesFromEstimate(estimateJob, estimateLines, boardJobs = []) {
  const estLines = normalizeDocLines(estimateLines);
  const linked = findJobsLinkedToEstimate(boardJobs, estimateJob);
  // Always include same-job invoice when present even if board list is stale/slim.
  if (
    estimateJob &&
    (estimateJob.invoiceNo || estimateJob._invoiceConfirmed || estimateJob.invoiceLines?.length) &&
    !linked.some((j) => String(j.id) === String(estimateJob.id))
  ) {
    linked.unshift(estimateJob);
  }
  const out = [];
  for (const inv of linked) {
    const patch = planInvoicePatchFromEstimateUpdate(inv, estLines);
    if (!patch) continue;
    out.push({
      jobId: inv.id,
      patch,
      progressPct: patch.invoiceProgressPct,
      invoiceNo: inv.invoiceNo || "",
      prevAmount: inv.amount,
      nextAmount: patch.amount,
    });
  }
  return out;
}

function buildDocJobPatch(job, { kind, mode, lines, serviceAddress, apartment, markDone, progressPct, contractAmount, discountType, discountValue }) {
  const valid = normalizeDocLines(lines || []);
  const linesSub = linesTotal(valid);
  // Face total for $ discounts: prefer line math, but never ignore the stored
  // invoice amount / baseline (mobile list-projection jobs + QBO imports often
  // have sparse lines). Without this, a $5,000 discount on a $41,500 invoice
  // can resolve to $0 when lines are empty/stale (Levi 2026-08-11 inv #231596).
  // amount + existing discount restores pre-discount face on re-edit.
  const faceTotal = docFaceTotal(job, linesSub);
  const discInput = {
    type: discountType === "percent" ? "percent" : "amount",
    value: discountValue,
  };
  // Prefer explicit builder input; fall back to what is already on the job.
  const hasExplicit =
    discountType != null ||
    (discountValue != null && discountValue !== "");
  // Percent is always of line subtotal; dollar amount uses face total so a
  // typed $ discount sticks even when line rows are incomplete on mobile.
  const discBase =
    discInput.type === "percent"
      ? linesSub > 0
        ? linesSub
        : faceTotal
      : faceTotal > 0
        ? faceTotal
        : linesSub;
  const discPatch = hasExplicit
    ? discountJobPatch(discBase, discInput)
    : discountJobPatch(discBase, {
        type: job?.discountType === "percent" ? "percent" : "amount",
        value:
          job?.discountType === "percent"
            ? job?.discountPercent ?? job?.discountValue
            : job?.discount ?? job?.discountValue,
      });
  // Total = (lines when present, else face) minus discount dollars.
  const preDiscount = linesSub > 0 ? linesSub : faceTotal;
  const total = docTotalAfterDiscount(preDiscount, {
    type: discPatch.discountType,
    value: discPatch.discountType === "percent" ? discPatch.discountPercent : discPatch.discount,
  });
  // Hard guard: never collapse a real invoice to $0 just because lines were empty
  // when a discount was typed (would mark paid + wipe balance).
  const prevAmt = parseAmount(job?.amount) || 0;
  const safeTotal =
    prevAmt > 0.01 && total <= 0.01 && discPatch.discount > 0
      ? Math.max(0, prevAmt - discPatch.discount)
      : total;
  const jobPatch = {
    ...sharedAddressFields(serviceAddress, apartment),
    amount: fmt$(safeTotal),
    [kind === "estimate" ? "estimateLines" : "invoiceLines"]: valid,
    ...discPatch,
  };

  // Estimate save: contract always lives on estimateLines + contractAmount.
  // If this job (or a sibling) also has an invoice, re-apply the same progress %
  // so inv due scales with the new estimate (Goodness $4,600→$9,200 @ 50% → $4,600).
  // Never Object.assign the full inv patch over the estimate — that replaced the
  // estimate face amount with the invoice due and looked like a "revert" after Save.
  if (kind === "estimate") {
    jobPatch.estimateLines = cloneLines(valid);
    jobPatch.contractAmount = safeTotal;
    jobPatch.amount = fmt$(safeTotal);
    const hasInvoice =
      !!(String(job.invoiceNo || "").trim() || job._invoiceConfirmed || (job.invoiceLines && job.invoiceLines.length));
    if (hasInvoice) {
      const invPatch = planInvoicePatchFromEstimateUpdate(job, valid, { progressPct });
      if (invPatch) {
        jobPatch.invoiceLines = invPatch.invoiceLines;
        jobPatch.invoiceProgressBilling = invPatch.invoiceProgressBilling;
        jobPatch.invoiceProgressPct = invPatch.invoiceProgressPct;
        // Dual job A/R face = invoice due; estimate total stays on estimateLines/contractAmount.
        jobPatch.amount = invPatch.amount;
        if (invPatch.openBalance != null) jobPatch.openBalance = invPatch.openBalance;
        if (invPatch.paid != null) jobPatch.paid = invPatch.paid;
        if (invPatch.balanceDue != null) jobPatch.balanceDue = invPatch.balanceDue;
      }
    }
  }

  if (kind === "invoice" && isProgressBillingContext(job, { kind, mode })) {
    Object.assign(jobPatch, progressBillingJobPatch(valid, job, { progressPct, contractAmount }));
  }

  // Always recompute balance due on invoice save (progress % / line edits /
  // re-save after a corrupt stamp). Skip only when total is empty/zero and the
  // job already has no amount — otherwise heal openBalance = invoice − paid.
  if (kind === "invoice" && safeTotal >= 0) {
    Object.assign(jobPatch, reconcileBalanceOnAmountChange(job, safeTotal));
  }

  // Prefer original#-CO-N for local PDF / display on CO jobs (not confirmed until QBO).
  // Only stamp when the job still has no real number so create vs update stays correct.
  if (kind === "invoice" && !String(job.invoiceNo || "").trim()) {
    const coNo = preferredChangeOrderDocNo(job, "invoice");
    if (coNo) jobPatch._preferredInvoiceNo = coNo;
  }
  if (kind === "estimate" && !String(job.estimateNo || "").trim()) {
    const coNo = preferredChangeOrderDocNo(job, "estimate");
    if (coNo) jobPatch._preferredEstimateNo = coNo;
  }

  if (markDone) {
    jobPatch.status = statusPatch(kind);
    if (kind === "invoice" && mode === "turn_from_estimate") {
      jobPatch.status = { ...jobPatch.status, Accepted: { s: "done", d: todayStr() } };
    }
  }

  if (valid.some((ln) => ln.description?.trim() || ln.itemName?.trim())) {
    Object.assign(jobPatch, briefTitlePatch({ ...job, ...jobPatch }, kind));
  }

  return { valid, total: safeTotal, jobPatch };
}

/** Plan local job patch only — Save & close (no QuickBooks commands). */
export function planDocSaveLocal(job, { kind, mode, lines, serviceAddress, apartment, progressPct, contractAmount, discountType, discountValue }) {
  const { jobPatch } = buildDocJobPatch(job, {
    kind,
    mode,
    lines,
    serviceAddress,
    apartment,
    markDone: true,
    progressPct,
    contractAmount,
    discountType,
    discountValue,
  });
  return { jobPatch };
}

/** Plan local job patch + command bus enqueue for Save & sync (incl. linked doc address sync). */
export function planDocSaveSync(job, { kind, mode, lines, serviceAddress, apartment, progressPct, send, contractAmount, recurringState, discountType, discountValue }) {
  const hasInvoice = !!(job?.invoiceNo || job?._invoiceConfirmed);
  const syncMode = kind === "invoice" && mode !== "edit" && hasInvoice ? "edit" : mode;

  const { valid, jobPatch } = buildDocJobPatch(job, {
    kind,
    mode: syncMode,
    lines,
    serviceAddress,
    apartment,
    markDone: false,
    progressPct,
    contractAmount,
    discountType,
    discountValue,
  });
  const recurring = kind === "invoice" ? buildRecurringPayload(recurringState, { send }) : null;
  // Merge preferred CO doc # onto the job for the QBO payload without flipping create→update.
  const jobForPayload = { ...job, ...jobPatch };
  if (kind === "invoice" && !String(job.invoiceNo || "").trim() && jobPatch._preferredInvoiceNo) {
    jobForPayload.invoiceNo = jobPatch._preferredInvoiceNo;
  }
  if (kind === "estimate" && !String(job.estimateNo || "").trim() && jobPatch._preferredEstimateNo) {
    jobForPayload.estimateNo = jobPatch._preferredEstimateNo;
  }

  const primaryPayload = buildDocCommandPayload(jobForPayload, {
    kind,
    lines: valid,
    serviceAddress,
    apartment,
    mode: syncMode,
    progressPct,
    send,
    recurring,
  });

  const primaryType =
    syncMode === "edit"
      ? kind === "estimate"
        ? "update_estimate"
        : "update_invoice"
      : kind === "estimate"
      ? "create_estimate"
      : "create_invoice";

  const commands = [
    {
      type: primaryType,
      payload: primaryPayload,
      idk: docIdempotencyKey(kind, job.id, valid, syncMode),
    },
  ];

  if (recurring && syncMode !== "edit") {
    commands.push({
      type: "create_recurring_invoice",
      payload: { ...primaryPayload, recurring },
      idk: recurringIdempotencyKey(job.id, valid, recurringState),
    });
  }

  if (syncMode === "edit" && job.estimateNo && job.invoiceNo) {
    const otherKind = kind === "estimate" ? "invoice" : "estimate";
    const otherLines =
      otherKind === "estimate"
        ? cloneLines(job.estimateLines?.length ? job.estimateLines : valid)
        : cloneLines(job.invoiceLines?.length ? job.invoiceLines : valid);

    const linkedPayload = buildDocCommandPayload(job, {
      kind: otherKind,
      lines: otherLines,
      serviceAddress,
      apartment,
      mode: "edit",
      send: false,
    });

    const linkedType = otherKind === "estimate" ? "update_estimate" : "update_invoice";
    const addrSig = String(serviceAddress || "").trim() + "|" + String(apartment || "").trim();
    commands.push({
      type: linkedType,
      payload: linkedPayload,
      idk: docIdempotencyKey(otherKind, job.id, otherLines, "edit") + ":link:" + addrSig,
    });
  }

  return { jobPatch, commands };
}