/**
 * S24 — upload completed Form A from the Con Edison Application TAB (docs store)
 * to Con Ed case Documents. Drive is S25 optional — not required for upload.
 *
 * Flow (mapped): case → Documents → "+ Add a Document" → type "Application for Service"
 * → SELECT FILE (PDF ≤10MB) → Submit. Levi 2026-08-05: document upload does NOT need a
 * human confirm (Con Ed takes a day+ to show it). Create-case still stops at Review.
 * Session-only, no stored password.
 *
 * Source of truth: job tab completedFiles (docKey / docs URL). Drive path is a hint only.
 */
import { buildConedCompletedFileName, resolveConedMeterLabel } from "./completedFileName.js";
import { listConedCompletedFiles } from "./completeDestinations.js";

export const CONED_UPLOAD_DOCUMENT_CMD = "coned_upload_document";
export const DOCUMENT_TYPE = "Application for Service";
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB portal limit

export const DRIVE_COMPANY = "BLZ Electric Inc";
export const DRIVE_FOLDER = "Con Edison Applications";

/**
 * Resolve which Form A to upload for this job/meter.
 */
export function resolveFormAForUpload({ job = {}, answers = {}, meterLabel = "" } = {}) {
  const meter = resolveConedMeterLabel({ answers, job, meterLabel });
  const files = listConedCompletedFiles(job);
  const byMeter = files.find((f) => String(f.meterLabel || "") === String(meter));
  const first = byMeter || files[0] || null;
  const filename =
    (first && first.name) ||
    buildConedCompletedFileName({ answers, job, meterLabel: meter });
  return {
    filename,
    meterLabel: meter,
    docKey: first?.docKey || "",
    url: first?.url || "",
    dedicatedFolder: `${DRIVE_COMPANY}/${DRIVE_FOLDER}`,
    drivePathHint: `${DRIVE_COMPANY}/${DRIVE_FOLDER}/${filename}`,
    documentType: DOCUMENT_TYPE,
    maxBytes: MAX_PDF_BYTES,
  };
}

/**
 * Build host upload payload.
 */
export function buildUploadToCasePayload({
  job = {},
  answers = {},
  meterLabel = "",
  caseNumber = "",
} = {}) {
  const resolved = resolveFormAForUpload({ job, answers, meterLabel });
  const mc =
    String(
      caseNumber ||
        job?.paperwork?.coned?.caseNumber ||
        job?.paperwork?.coned?.createCase?.execution?.caseNumber ||
        ""
    ).trim() || "";
  return {
    skill: "coned-upload-document",
    version: 1,
    jobId: job.id || "",
    caseNumber: mc,
    filename: resolved.filename,
    dedicatedFolder: resolved.dedicatedFolder,
    drivePathHint: resolved.drivePathHint,
    documentType: DOCUMENT_TYPE,
    maxBytes: MAX_PDF_BYTES,
    // Levi 2026-08-05: Form A upload submit does not need human confirm.
    stopAt: "submitted",
    autoSubmit: true,
    docKey: resolved.docKey,
    meterLabel: resolved.meterLabel,
  };
}

/**
 * Queue upload-to-case on host (needs authenticated Con Ed session + tab Form A).
 * Prefer docKey from the Con Edison Application tab; Drive is optional S25.
 */
export async function queueConedUploadDocument({
  job = {},
  answers = {},
  meterLabel = "",
  caseNumber = "",
  enqueue = null,
  onSave = null,
} = {}) {
  const payload = buildUploadToCasePayload({ job, answers, meterLabel, caseNumber });
  if (!payload.caseNumber) {
    return {
      ok: false,
      error: "missing_case_number: create the case first (or enter MC-######)",
      payload,
    };
  }
  if (!payload.filename && !payload.docKey) {
    return {
      ok: false,
      error: "missing_form_a: complete Form A so it lands in the Con Edison Application tab first",
      payload,
    };
  }

  const uploadState = {
    status: "queued",
    queuedAt: new Date().toISOString(),
    payload,
    error: "",
  };

  if (typeof onSave === "function") {
    onSave({
      paperwork: {
        coned: {
          uploadDocument: uploadState,
        },
      },
    });
  }

  if (typeof enqueue !== "function") {
    return {
      ok: false,
      queued: false,
      error:
        "enqueue_not_wired: host command_listener must handle coned_upload_document (session-only)",
      payload,
      uploadState: { ...uploadState, status: "blocked", error: "enqueue_not_wired" },
    };
  }

  try {
    const idk = `coned-upload:${job.id || "job"}:${payload.caseNumber}:${payload.filename}`;
    await enqueue(CONED_UPLOAD_DOCUMENT_CMD, job.id || "coned", payload, "deterministic", idk);
    return {
      ok: true,
      queued: true,
      payload,
      uploadState: { ...uploadState, status: "queued", note: "awaiting_host_upload_submit" },
    };
  } catch (err) {
    return {
      ok: false,
      queued: false,
      error: String(err?.message || err),
      payload,
      uploadState: {
        ...uploadState,
        status: "error",
        error: String(err?.message || err),
      },
    };
  }
}
