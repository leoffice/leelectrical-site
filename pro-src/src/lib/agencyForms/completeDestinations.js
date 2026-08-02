/**
 * Build Slice 1 — 3 completion destinations for a finished Con Ed Form A.
 *
 * 1) Email CUSTOMER (branded) + keep office@ copy
 * 2) Save into job "Con Edison Application" tab (docs store + job record)
 * 3) Save copy to Google Drive (host command → Drive folder)
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
 * Run all three destinations. Never throws for partial failure — returns per-destination results.
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

  // —— 1a) Customer email ——
  let customerEmailResult = {
    ok: false,
    skipped: !customerEmail,
    to: customerEmail,
    error: customerEmail ? "" : "no_customer_email",
  };
  if (customerEmail && api && typeof api.sendDocEmailNow === "function") {
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
        to: customerEmail,
        at: Date.now(),
        error: r?.error || r?.reason || "",
        dryRun: !!r?.dryRun,
        id: r?.id || "",
      };
    } catch (err) {
      customerEmailResult = {
        ok: false,
        to: customerEmail,
        at: Date.now(),
        error: String(err?.message || err),
      };
    }
  } else if (customerEmail) {
    customerEmailResult = {
      ok: false,
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

  const submitted = buildApplicationDraft({
    agencyId: agency?.id,
    answers,
    status: "submitted",
    stepIndex: (agency?.steps?.length || 1) - 1,
    submittedAt: fileRecord.submittedAt,
    emailResult: {
      ok: !!(customerEmailResult.ok || officeEmailResult.ok),
      customer: customerEmailResult,
      office: officeEmailResult,
      to: customerEmail || officeTo,
      at: Date.now(),
      error:
        customerEmailResult.ok || officeEmailResult.ok
          ? ""
          : customerEmailResult.error || officeEmailResult.error || "",
    },
  });
  // Attach destinations snapshot on the draft for audit / Test-2
  submitted.completedFile = fileRecord;
  submitted.filename = filename;

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

  // —— 3) Google Drive (host command) ——
  let driveResult = {
    ok: false,
    filename,
    error: "drive_not_attempted",
    queued: false,
  };
  if (typeof enqueue === "function") {
    try {
      const idk = `drive-coned:${job.id || "job"}:${meter}:${filename}`;
      await enqueue(
        "drive_save_coned",
        job.id || "coned",
        {
          pdfB64,
          filename,
          folderName: "Con Edison Applications",
          companyRoot: "BLZ Electric Inc",
          jobId: job.id || "",
          meterLabel: meter,
          serviceAddress: fileRecord.serviceAddress,
        },
        "deterministic",
        idk
      );
      driveResult = {
        ok: true, // queued — host must land the file; Test-2 verifies presence
        queued: true,
        filename,
        error: "",
        note: "queued_drive_save_coned",
      };
    } catch (err) {
      driveResult = {
        ok: false,
        queued: false,
        filename,
        error: String(err?.message || err),
      };
    }
  } else if (api && typeof api.saveConedToDrive === "function") {
    try {
      const r = await api.saveConedToDrive({
        pdfB64,
        filename,
        folderName: "Con Edison Applications",
      });
      driveResult = {
        ok: !!r?.ok,
        filename,
        path: r?.path || r?.webViewLink || "",
        error: r?.error || r?.reason || "",
        queued: false,
      };
    } catch (err) {
      driveResult = {
        ok: false,
        filename,
        error: String(err?.message || err),
        queued: false,
      };
    }
  } else {
    driveResult = {
      ok: false,
      filename,
      error:
        "drive_host_not_wired: no enqueue + no api.saveConedToDrive — host command_listener must handle drive_save_coned or mount BLZ Electric Inc/Con Edison Applications",
      queued: false,
    };
  }

  return {
    filename,
    pdfB64,
    meterLabel: meter,
    destinations: {
      customerEmail: customerEmailResult,
      officeEmail: officeEmailResult,
      jobTab: {
        ok: !!docPut.ok && !!fileRecord.name,
        file: fileRecord,
        error: docPut.ok ? "" : docPut.error || "docs_put_failed",
      },
      drive: driveResult,
    },
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
  // Legacy: single submitted application without completedFiles array
  const app = job?.paperwork?.coned?.application;
  if (app?.status === "submitted" && (app.completedFile || app.filename)) {
    return [
      app.completedFile || {
        name: app.filename,
        status: "submitted",
        submittedAt: app.submittedAt || "",
        url: "",
      },
    ];
  }
  return [];
}
