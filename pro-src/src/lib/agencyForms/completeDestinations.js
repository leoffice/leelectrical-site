/**
 * Build Slice 1 — completion destinations for a finished Con Ed Form A.
 *
 * Routing (PLAN CORRECTION 2026-08-02 — Drive decoupled from ship gate):
 * 1) "Con Edison Application" tab — ALWAYS (docs store + job record) = durable record
 * 2) Customer email — OPT-IN only (customer chooses). Office@ copy always kept.
 * 3) Google Drive (S25) — best-effort / PARKED until CF Drive API credential exists.
 *    Never gates success or Test-2. Host may queue drive_save_coned; fail is non-fatal.
 *
 * Reuses proven fill: buildApplicationPdfBlob → fillConedFormAPdfBytes.
 */
import { functionsBase } from "../functionsBase.js";
import { authHeader } from "../session.js";
import {
  applicationFieldRows,
  buildApplicationDraft,
  buildApplicationEmailHtml,
  buildApplicationEmailText,
  resolveSubmitEmails,
} from "./engine.js";
import {
  buildApplicationPdfBlob,
  blobToBase64,
} from "./applicationPdf.js";
import {
  buildConedCompletedFileName,
  customerConedApplicationSubject,
  resolveConedMeterLabel,
} from "./completedFileName.js";
import { CONED_FORM_A_DEFAULT_EMAILS } from "./conedFormA.js";
import { saveConedToDriveApi } from "./gdriveSave.js";
import { completionTodoPatch } from "./paperworkTodos.js";

const OFFICE_DEFAULT = CONED_FORM_A_DEFAULT_EMAILS[0] || "office@leelectrical.us";

function safeDocsKeyPart(s) {
  return String(s || "x")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 24);
}

/**
 * docs key: coned-<job>-<ts>  (KEY_RE: ^[a-z]{2,8}-[A-Za-z0-9._-]{1,64}$)
 */
export function buildConedDocKey(job = {}, meterLabel = "") {
  const jid = safeDocsKeyPart(job.id || job.jobId || "job");
  const mid = safeDocsKeyPart(meterLabel || "m");
  const ts = Date.now().toString(36);
  // keep rest under 64 chars
  const rest = `${jid}-${mid}-${ts}`.slice(0, 64);
  return `coned-${rest}`;
}

/**
 * Store PDF in the shared docs blob store; returns fetch URL or null.
 */
export async function putCompletedApplicationDoc({
  pdfB64,
  filename,
  docKey,
  base = functionsBase,
} = {}) {
  const key = docKey || `coned-${Date.now().toString(36)}`;
  try {
    const res = await fetch(`${base()}/docs?cb=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({
        op: "put",
        key,
        b64: pdfB64,
        mime: "application/pdf",
        filename: String(filename || "application.pdf").replace(/[^\w .-]/g, "_"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        key,
        error: data.error || `docs put HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      key,
      url: `${base()}/docs?key=${encodeURIComponent(key)}`,
      bytes: data.bytes,
    };
  } catch (err) {
    return { ok: false, key, error: String(err?.message || err) };
  }
}

/** Friendly plain body for the customer copy. */
export function buildCustomerConedEmailText({ answers = {}, job = {}, filename = "" } = {}) {
  const first =
    String(answers.accountName || job.customer || job.customerName || "there")
      .trim()
      .split(/\s+/)[0] || "there";
  const address = String(
    answers.serviceAddress || job.serviceAddress || job.address || ""
  ).trim();
  const lines = [
    `Hi ${first},`,
    "",
    "Your Con Edison application for service is complete.",
    address ? `Service address: ${address}` : "",
    "",
    `The filled Form A PDF is attached${filename ? ` (${filename})` : ""}.`,
    "",
    "Keep this for your records. Your electrician still files it in the Con Edison portal — this email is your copy only.",
    "",
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    "BLZ Electric",
  ].filter((l, i, arr) => l !== "" || (arr[i - 1] !== "" && i > 0));
  // collapse double blanks from optional address
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function buildCustomerConedEmailHtml({ answers = {}, job = {}, filename = "" } = {}) {
  const text = buildCustomerConedEmailText({ answers, job, filename });
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.5">
  <p style="white-space:pre-wrap;margin:0">${esc(text)}</p>
  </body></html>`;
}

/**
 * Whether the customer opted in to receive the completed Form A by email.
 * OPT-IN only — missing / false / "no" / 0 all mean skip customer email.
 * Explicit true / "yes" / "1" / "on" mean send.
 */
export function isCustomerEmailOptIn(answers = {}, opts = {}) {
  if (typeof opts.emailCustomerCopy === "boolean") return opts.emailCustomerCopy;
  if (typeof opts.customerEmailOptIn === "boolean") return opts.customerEmailOptIn;
  const raw =
    answers.emailCustomerCopy ??
    answers.customerEmailOptIn ??
    answers.emailCopyOptIn ??
    null;
  if (raw === true || raw === 1 || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "no" || raw === "off") return false;
  // Default: opt-OUT (customer must choose)
  return false;
}

/**
 * Run destinations. Never throws for partial failure — returns per-destination results.
 *
 * Drive + tab ALWAYS. Customer email only when emailCustomerCopy / answers.emailCustomerCopy is true.
 *
 * @param {object} opts
 * @param {object} opts.agency
 * @param {Record<string, any>} opts.answers
 * @param {object} opts.job
 * @param {object} [opts.api] store api with sendDocEmailNow
 * @param {(patch: object) => void} [opts.onSave]
 * @param {Function} [opts.enqueue] command bus enqueue
 * @param {string} [opts.meterLabel]
 * @param {string} [opts.destEmailOverride] office override from review field
 * @param {boolean} [opts.emailCustomerCopy] customer email opt-in (default false)
 */
export async function completeConedApplicationDestinations({
  agency,
  answers = {},
  job = {},
  api = null,
  onSave = null,
  enqueue = null,
  meterLabel = "",
  destEmailOverride = "",
  emailCustomerCopy,
  customerEmailOptIn,
} = {}) {
  const meter = resolveConedMeterLabel({ answers, job, meterLabel });
  const filename = buildConedCompletedFileName({ answers, job, meterLabel: meter });
  const blob = await buildApplicationPdfBlob({ agency, answers, job });
  const pdfB64 = await blobToBase64(blob);
  const docKey = buildConedDocKey(job, meter);

  const customerEmail = String(
    answers.email || answers.emailFromContact || job.email || job.customerEmail || ""
  )
    .trim()
    .split(/[,;]/)[0]
    .trim();

  const officeEmails = resolveSubmitEmails(agency, destEmailOverride);
  const officeTo = officeEmails[0] || OFFICE_DEFAULT;

  const wantCustomerEmail = isCustomerEmailOptIn(answers, {
    emailCustomerCopy,
    customerEmailOptIn,
  });

  // —— 1a) Customer email (OPT-IN only) ——
  let customerEmailResult = {
    ok: false,
    skipped: true,
    optIn: wantCustomerEmail,
    to: customerEmail,
    error: "",
  };
  if (!wantCustomerEmail) {
    customerEmailResult = {
      ok: false,
      skipped: true,
      optIn: false,
      to: customerEmail,
      error: "",
      reason: "customer_opted_out",
    };
  } else if (!customerEmail) {
    customerEmailResult = {
      ok: false,
      skipped: true,
      optIn: true,
      to: "",
      error: "no_customer_email",
      reason: "opt_in_but_no_email",
    };
  } else if (api && typeof api.sendDocEmailNow === "function") {
    try {
      const r = await api.sendDocEmailNow(job, "application", {
        email: customerEmail,
        pdfB64,
        filename,
        subject: customerConedApplicationSubject(job, answers),
        message: buildCustomerConedEmailText({ answers, job, filename }),
        htmlBody: buildCustomerConedEmailHtml({ answers, job, filename }),
        includePaymentLink: false,
        application: {
          agencyId: agency?.id,
          formTitle: agency?.formTitle,
          rows: applicationFieldRows(agency, answers),
          copy: "customer",
        },
      });
      customerEmailResult = {
        ok: !!r?.ok,
        skipped: false,
        optIn: true,
        to: customerEmail,
        at: Date.now(),
        error: r?.error || r?.reason || "",
        dryRun: !!r?.dryRun,
        id: r?.id || "",
      };
    } catch (err) {
      customerEmailResult = {
        ok: false,
        skipped: false,
        optIn: true,
        to: customerEmail,
        at: Date.now(),
        error: String(err?.message || err),
      };
    }
  } else {
    customerEmailResult = {
      ok: false,
      skipped: false,
      optIn: true,
      to: customerEmail,
      error: "no_send_api",
    };
  }

  // —— 1b) Office copy (always keep) ——
  let officeEmailResult = { ok: false, to: officeTo, error: "no_send_api" };
  if (api && typeof api.sendDocEmailNow === "function") {
    try {
      const subject = `${agency?.formTitle || "Con Edison Form A"} — ${
        job?.customer || job?.customerName || "Job"
      } ${job?.serviceAddress || job?.address || ""}`.trim();
      const r = await api.sendDocEmailNow(job, "application", {
        email: officeTo,
        pdfB64,
        filename,
        subject,
        message: buildApplicationEmailText(agency, answers, job),
        htmlBody: buildApplicationEmailHtml(agency, answers, job),
        includePaymentLink: false,
        application: {
          agencyId: agency?.id,
          formTitle: agency?.formTitle,
          rows: applicationFieldRows(agency, answers),
          copy: "office",
        },
      });
      officeEmailResult = {
        ok: !!r?.ok,
        to: officeTo,
        at: Date.now(),
        error: r?.error || r?.reason || "",
        dryRun: !!r?.dryRun,
        id: r?.id || "",
      };
    } catch (err) {
      officeEmailResult = {
        ok: false,
        to: officeTo,
        at: Date.now(),
        error: String(err?.message || err),
      };
    }
  }

  // —— 2) Con Edison Application tab (docs + job record) ——
  const docPut = await putCompletedApplicationDoc({ pdfB64, filename, docKey });
  const fileRecord = {
    name: filename,
    docKey: docPut.key || docKey,
    url: docPut.url || "",
    meterLabel: meter,
    personName: String(answers.accountName || job.customer || "").trim(),
    serviceAddress: String(
      answers.serviceAddress || job.serviceAddress || job.address || ""
    ).trim(),
    status: "submitted",
    submittedAt: new Date().toISOString(),
    bytes: docPut.bytes || 0,
    storeOk: !!docPut.ok,
    storeError: docPut.ok ? "" : docPut.error || "",
  };

  const emailOk =
    !!officeEmailResult.ok &&
    (customerEmailResult.skipped || !!customerEmailResult.ok);
  const submitted = buildApplicationDraft({
    agencyId: agency?.id,
    answers: {
      ...answers,
      emailCustomerCopy: wantCustomerEmail,
    },
    status: "submitted",
    stepIndex: (agency?.steps?.length || 1) - 1,
    submittedAt: fileRecord.submittedAt,
    emailResult: {
      ok: emailOk,
      customer: customerEmailResult,
      office: officeEmailResult,
      to: wantCustomerEmail && customerEmail ? customerEmail : officeTo,
      at: Date.now(),
      error:
        officeEmailResult.ok && (customerEmailResult.skipped || customerEmailResult.ok)
          ? ""
          : customerEmailResult.skipped
            ? officeEmailResult.error || ""
            : customerEmailResult.error || officeEmailResult.error || "",
    },
  });
  // Attach destinations snapshot on the draft for audit / Test-2
  submitted.completedFile = fileRecord;
  submitted.filename = filename;
  submitted.emailCustomerCopy = wantCustomerEmail;

  const existingFiles = Array.isArray(job?.paperwork?.coned?.completedFiles)
    ? job.paperwork.coned.completedFiles.slice()
    : [];
  // One file per meter: replace same meterLabel if resubmitted
  const withoutSame = existingFiles.filter(
    (f) => String(f.meterLabel || "") !== String(meter)
  );
  withoutSame.push(fileRecord);

  if (typeof onSave === "function") {
    onSave({
      paperwork: {
        coned: {
          application: submitted,
          completedFiles: withoutSame,
          steps: { "Application submitted": true },
          active: { "Application submitted": true },
          enabled: true,
        },
      },
    });
  }

  // —— 3) Google Drive (S25/S26) — BEST-EFFORT only, never gates ship ——
  // Per-tenant Drive API first (gdrive-save function + profile gdriveFolderId,
  // skips silently when unconfigured), then the LE host command bus, else
  // parked. Durable record is the Con Edison Application tab above.
  const DRIVE_COMPANY = "BLZ Electric Inc";
  const DRIVE_FOLDER = "Con Edison Applications";
  const dedicatedFolder = `${DRIVE_COMPANY}/${DRIVE_FOLDER}`;
  let driveResult = {
    ok: false,
    filename,
    folder: dedicatedFolder,
    error: "s25_parked_no_drive_credential",
    queued: false,
    critical: false,
    slice: "S25",
    parked: true,
  };
  let apiDriveLanded = false;
  // S26: white-label Drive API — attempted for every tenant; the function
  // answers { skipped:true } when no GDRIVE credential/folder is configured.
  try {
    const r = await saveConedToDriveApi({ pdfB64, filename });
    if (r?.ok) {
      apiDriveLanded = true;
      driveResult = {
        ok: true,
        queued: false,
        filename,
        folder: dedicatedFolder,
        path: r.webViewLink || "",
        webViewLink: r.webViewLink || "",
        driveFileId: r.id || "",
        error: "",
        note: "gdrive_api",
        critical: false,
        slice: "S26",
        parked: false,
      };
    }
  } catch {
    /* saveConedToDriveApi never throws; belt and suspenders */
  }
  if (apiDriveLanded) {
    // done — tenant Drive API landed the copy
  } else if (typeof enqueue === "function") {
    try {
      const idk = `drive-coned:${job.id || "job"}:${meter}:${filename}`;
      await enqueue(
        "drive_save_coned",
        job.id || "coned",
        {
          pdfB64,
          filename,
          folderName: DRIVE_FOLDER,
          companyRoot: DRIVE_COMPANY,
          jobId: job.id || "",
          meterLabel: meter,
          serviceAddress: fileRecord.serviceAddress,
          createFolderIfMissing: true,
          bestEffort: true,
          slice: "S25",
        },
        "deterministic",
        idk
      );
      driveResult = {
        ok: true, // queued — optional host land; does not gate success
        queued: true,
        filename,
        folder: dedicatedFolder,
        error: "",
        note: "queued_drive_save_coned_best_effort",
        critical: false,
        slice: "S25",
        parked: false,
      };
    } catch (err) {
      driveResult = {
        ok: false,
        queued: false,
        filename,
        folder: dedicatedFolder,
        error: String(err?.message || err),
        critical: false,
        slice: "S25",
        parked: true,
      };
    }
  } else if (api && typeof api.saveConedToDrive === "function") {
    try {
      const r = await api.saveConedToDrive({
        pdfB64,
        filename,
        folderName: DRIVE_FOLDER,
        companyRoot: DRIVE_COMPANY,
        createFolderIfMissing: true,
      });
      driveResult = {
        ok: !!r?.ok,
        filename,
        folder: dedicatedFolder,
        path: r?.path || r?.webViewLink || "",
        error: r?.error || r?.reason || "",
        queued: false,
        critical: false,
        slice: "S25",
        parked: !r?.ok,
      };
    } catch (err) {
      driveResult = {
        ok: false,
        filename,
        folder: dedicatedFolder,
        error: String(err?.message || err),
        queued: false,
        critical: false,
        slice: "S25",
        parked: true,
      };
    }
  } else {
    driveResult = {
      ok: false,
      filename,
      folder: dedicatedFolder,
      error:
        "s25_parked: no GDRIVE credential on CF — tab is durable record; need GDRIVE_SA_JSON or GDRIVE_OAUTH_TOKEN + folder ID to unpark Drive",
      queued: false,
      critical: false,
      slice: "S25",
      parked: true,
    };
  }

  const driveOk = !!(driveResult.ok || driveResult.queued);
  const tabOk = !!docPut.ok && !!fileRecord.name;
  // Ship gate: TAB always. Customer email optional (opt-in). Drive (S25) never gates.
  const success = tabOk;

  // —— 4) Completion TO-DO (Levi redirect) — no auto-upload for now ——
  // A finished application adds "Upload application to the Con Ed case" to
  // the paperwork to-do list + a notification. Levi fires it with Ready to go
  // once Energy Services access is unlocked. Never gates completion.
  let completionTodo = { added: false };
  if (tabOk) {
    try {
      completionTodo = completionTodoPatch(job, { meterLabel: meter, source: "office" });
      if (completionTodo.patch && typeof onSave === "function") {
        onSave(completionTodo.patch);
      }
    } catch (err) {
      completionTodo = { added: false, error: String(err?.message || err) };
    }
  }

  return {
    completionTodo,
    filename,
    pdfB64,
    meterLabel: meter,
    destinations: {
      customerEmail: customerEmailResult,
      officeEmail: officeEmailResult,
      jobTab: {
        ok: tabOk,
        file: fileRecord,
        error: docPut.ok ? "" : docPut.error || "docs_put_failed",
      },
      drive: driveResult,
    },
    /** Gate for ship/report: Con Edison Application tab must land. Drive is S25 optional. */
    success,
    /** @deprecated always false after plan correction — Drive never critical */
    driveCriticalFailed: false,
    driveParked: !driveOk,
    submitted,
    completedFiles: withoutSame,
  };
}

/**
 * List completed Con Ed applications on a job (tab data).
 */
export function listConedCompletedFiles(job = {}) {
  const files = job?.paperwork?.coned?.completedFiles;
  if (Array.isArray(files) && files.length) return files;
  // Legacy / customer portal: single application without completedFiles array
  const app = job?.paperwork?.coned?.application;
  const st = String(app?.status || "").toLowerCase();
  const doneish =
    st === "submitted" ||
    st === "customer_submitted" ||
    st === "complete" ||
    st === "completed" ||
    st === "file_ready" ||
    st === "ready";
  if (app && doneish && (app.completedFile || app.filename || app.docKey || app.answers)) {
    return [
      app.completedFile || {
        name: app.filename || "Form A application",
        status: app.status || "submitted",
        submittedAt: app.submittedAt || "",
        docKey: app.docKey || "",
        url: app.url || "",
        meterLabel: app.meterLabel || "",
      },
    ];
  }
  return [];
}

/** True when a completed Form A is on the tab but not yet uploaded to the case. */
export function isConedFileReadyToUpload(f) {
  if (!f) return false;
  if (f.uploadedAt || f.uploadedToCase) return false;
  if (String(f.status || "").toLowerCase() === "uploaded") return false;
  return true;
}

/** Completed Form A files waiting to upload to the Con Ed case. */
export function listReadyConedApplications(job = {}) {
  return listConedCompletedFiles(job).filter(isConedFileReadyToUpload);
}

/**
 * How many customer applications are ready to upload (for Job Info + Permits).
 * Prefers slim-list `appsReady` when full files are not on the client yet.
 */
export function countReadyConedApplications(job = {}) {
  if (job && Number.isFinite(Number(job.appsReady)) && Number(job.appsReady) > 0) {
    return Math.floor(Number(job.appsReady));
  }
  let n = listReadyConedApplications(job).length;
  if (n > 0) return n;
  const todos = Array.isArray(job?.paperwork?.todos) ? job.paperwork.todos : [];
  for (const t of todos) {
    if (!t || t.status === "done" || t.status === "removed" || t.status === "queued") continue;
    if (t.kind === "upload_application" || t.kind === "send_application") n += 1;
  }
  if (
    n === 0 &&
    String(job?.paperwork?.coned?.uploadDocument?.status || "").toLowerCase() === "file_ready"
  ) {
    n = 1;
  }
  return n;
}
