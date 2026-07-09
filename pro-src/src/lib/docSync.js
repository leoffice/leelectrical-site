// Bi-directional estimate ↔ invoice sync — shared address fields + QBO update commands.
import { fmt$, todayStr } from "./format.js";
import {
  buildDocCommandPayload,
  docIdempotencyKey,
  emptyLine,
  linesTotal,
} from "./qboDoc.js";

export const DOC_SYNC_COMMAND_TYPES = [
  "create_estimate",
  "create_invoice",
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

/** Plan local job patch + command bus enqueue for Save & sync (incl. linked doc address sync). */
export function planDocSaveSync(job, { kind, mode, lines, serviceAddress, apartment, progressPct, send }) {
  const valid = lines || [];
  const total = linesTotal(valid);
  const primaryPayload = buildDocCommandPayload(job, {
    kind,
    lines: valid,
    serviceAddress,
    apartment,
    mode,
    progressPct,
    send,
  });

  const primaryType =
    mode === "edit"
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
      idk: docIdempotencyKey(kind, job.id, valid, mode),
    },
  ];

  const jobPatch = {
    ...sharedAddressFields(serviceAddress, apartment),
    amount: fmt$(total),
    [kind === "estimate" ? "estimateLines" : "invoiceLines"]: valid,
    status: statusPatch(kind),
  };

  if (kind === "invoice" && mode === "turn_from_estimate") {
    jobPatch.status = { ...jobPatch.status, Accepted: { s: "done", d: todayStr() } };
  }

  if (mode === "edit" && job.estimateNo && job.invoiceNo) {
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