/**
 * S28 — automatic upload-to-case on application completion.
 *
 * Levi: "When the application is completed in general, it should create an
 * automatic skill to go to the energy services, upload the application, and
 * then notify the LE Pro that this happened."
 *
 * Whenever a completed Form A lands on the Con Edison Application tab —
 * whether the office filled it or the customer filled it through their link —
 * this queues the S24 upload-to-case host skill (Energy Services → case
 * Documents → "Application for Service" → select file → review) and records a
 * notification on the job so LE Pro shows what happened. If the job has no
 * case number yet, it records "waiting for case number" instead; queuing the
 * upload then happens as soon as Submit a Case produces one.
 *
 * Never gates completion — upload is downstream of the durable tab record.
 */
import { queueConedUploadDocument } from "./uploadToCase.js";

const now = () => new Date().toISOString();

export function resolveConedCaseNumber(job = {}) {
  return String(
    job?.paperwork?.coned?.caseNumber ||
      job?.paperwork?.coned?.createCase?.execution?.caseNumber ||
      ""
  ).trim();
}

/** Append a notification entry (kept small, newest last, max 20). */
export function conedNotification(job, entry) {
  const prev = Array.isArray(job?.paperwork?.coned?.notifications)
    ? job.paperwork.coned.notifications.slice(-19)
    : [];
  return [...prev, { at: now(), ...entry }];
}

/**
 * Auto-queue the upload for one completed meter. Returns per-call result and
 * (via onSave) records the state + a notification on the job.
 */
export async function autoUploadOnComplete({
  job = {},
  answers = {},
  meterLabel = "",
  source = "office",
  enqueue = null,
  onSave = null,
} = {}) {
  const caseNumber = resolveConedCaseNumber(job);

  if (!caseNumber) {
    const notifications = conedNotification(job, {
      type: "upload_waiting_case",
      meterLabel,
      source,
      text: "Application completed - will upload to the Con Ed case automatically once a case number is on this job.",
    });
    onSave?.({
      paperwork: {
        coned: {
          uploadDocument: {
            status: "waiting_case",
            queuedAt: now(),
            meterLabel,
            source,
            error: "",
          },
          notifications,
        },
      },
    });
    return { ok: false, queued: false, waitingForCase: true, caseNumber: "" };
  }

  const r = await queueConedUploadDocument({
    job,
    answers,
    meterLabel,
    caseNumber,
    enqueue,
    onSave: null, // we write one combined patch below
  });

  const notifications = conedNotification(job, {
    type: r.queued ? "upload_queued" : "upload_queue_failed",
    meterLabel: r.payload?.meterLabel || meterLabel,
    caseNumber,
    source,
    text: r.queued
      ? `Application completed - upload to Con Ed case ${caseNumber} queued (Document Type: Application for Service). It stops at review for a human confirm.`
      : `Application completed but the automatic upload could not be queued: ${r.error || "unknown error"}`,
  });

  onSave?.({
    paperwork: {
      coned: {
        uploadDocument: r.uploadState || {
          status: r.queued ? "queued" : "error",
          queuedAt: now(),
          payload: r.payload,
          error: r.error || "",
        },
        notifications,
      },
    },
  });

  return { ok: !!r.queued, queued: !!r.queued, caseNumber, error: r.error || "" };
}

/**
 * If a completion happened before a case number existed, call this when the
 * case number lands to fire the deferred upload.
 */
export async function autoUploadIfWaiting({ job = {}, enqueue = null, onSave = null } = {}) {
  const state = job?.paperwork?.coned?.uploadDocument;
  if (!state || state.status !== "waiting_case") return { ok: false, skipped: true };
  const caseNumber = resolveConedCaseNumber(job);
  if (!caseNumber) return { ok: false, skipped: true };
  return autoUploadOnComplete({
    job,
    meterLabel: state.meterLabel || "",
    source: state.source || "office",
    enqueue,
    onSave,
  });
}
