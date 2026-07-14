// Bi-directional estimate ↔ invoice sync — shared address fields + QBO update commands.
import { fmt$, todayStr } from "./format.js";
import {
  buildDocCommandPayload,
  docIdempotencyKey,
  emptyLine,
  linesTotal,
} from "./qboDoc.js";
import { buildRecurringPayload, recurringIdempotencyKey } from "./recurringBilling.js";
import { isProgressBillingContext, progressBillingJobPatch } from "./progressBilling.js";
import { briefTitlePatch } from "./changeOrder.js";

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

function buildDocJobPatch(job, { kind, mode, lines, serviceAddress, apartment, markDone, progressPct, contractAmount }) {
  const valid = lines || [];
  const total = linesTotal(valid);
  const jobPatch = {
    ...sharedAddressFields(serviceAddress, apartment),
    amount: fmt$(total),
    [kind === "estimate" ? "estimateLines" : "invoiceLines"]: valid,
  };

  if (kind === "invoice" && isProgressBillingContext(job, { kind, mode })) {
    Object.assign(jobPatch, progressBillingJobPatch(valid, job, { progressPct, contractAmount }));
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

  return { valid, total, jobPatch };
}

/** Plan local job patch only — Save & close (no QuickBooks commands). */
export function planDocSaveLocal(job, { kind, mode, lines, serviceAddress, apartment, progressPct, contractAmount }) {
  const { jobPatch } = buildDocJobPatch(job, {
    kind,
    mode,
    lines,
    serviceAddress,
    apartment,
    markDone: true,
    progressPct,
    contractAmount,
  });
  return { jobPatch };
}

/** Plan local job patch + command bus enqueue for Save & sync (incl. linked doc address sync). */
export function planDocSaveSync(job, { kind, mode, lines, serviceAddress, apartment, progressPct, send, contractAmount, recurringState }) {
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
  });
  const recurring = kind === "invoice" ? buildRecurringPayload(recurringState, { send }) : null;
  const primaryPayload = buildDocCommandPayload(job, {
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