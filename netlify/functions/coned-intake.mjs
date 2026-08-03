// coned-intake — the customer-fill loop for the Con Edison application.
//
// LE Pro's "Send the application to the customer" action registers a request
// here and emails the customer a personal link to /app/coned/apply.html
// (prefill + token ride in the URL hash). When the customer approves+submits
// a meter, the page POSTs the filled Form A PDF back here: we store the PDF
// in the shared docs store (so the Con Edison Application tab can list it),
// record the submission for the app to import, and email the office a branded
// copy with the PDF attached. Portal submission stays a human step.
//
// Ops (POST JSON):
//   { op:"request", jobId, prefill:{customer,serviceStreet,serviceCity,
//     serviceState,serviceZip,phone,email}, meters:[{name,unit,account,type}],
//     to, sendEmail } -> { ok, token, link, emailed }
//   { op:"submit", token, jobId, meterLabel, filename, answers, pdfB64 }
//     -> { ok, docKey }   (public — called by the customer page)
//   { op:"check", jobId } -> { ok, request, submission }
import { getStore } from "./lib/storage/index.mjs";
import { PRODUCT_BRAND } from "../../shared/productBrand.mjs";
import { bytesFromBase64 } from "./lib/base64.mjs";
import { sendApplicationEmail } from "./lib/applicationEmail.mjs";
import {
  buildBrandedEmailHtml,
  signatureText,
  leLogoAttachment,
  POWERED_BY_LE_TEXT,
} from "./lib/emailBranding.mjs";

const PUBLIC_BASE = "https://www.leelectrical.us";
const APPLY_PATH = "/app/coned/apply"; // Pages clean-URL (apply.html 308s here)
const RESEND_URL = "https://api.resend.com/emails";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

const s = (v) => (v == null ? "" : String(v).trim());

/** docs-store-safe key part (docs GET enforces ^[a-z]{2,8}-[A-Za-z0-9._-]{1,64}$). */
function safeKeyPart(v, max = 20) {
  return s(v).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, max) || "x";
}

function b64urlEncodeJson(obj) {
  const raw = JSON.stringify(obj);
  const b64 = Buffer.from(raw, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildApplyLink({ token, jobId, prefill = {}, meters = [] } = {}) {
  const payload = {
    t: s(token),
    jobId: s(jobId),
    customer: s(prefill.customer),
    serviceStreet: s(prefill.serviceStreet),
    serviceCity: s(prefill.serviceCity),
    serviceState: s(prefill.serviceState) || "NY",
    serviceZip: s(prefill.serviceZip),
    phone: s(prefill.phone),
    email: s(prefill.email),
    contactName: s(prefill.contactName) || s(prefill.customer),
    businessName: s(prefill.businessName),
    meters: (Array.isArray(meters) ? meters : [])
      .slice(0, 12)
      .map((m) => ({
        name: s(m.name),
        ...(m.unit != null && s(m.unit) ? { unit: s(m.unit) } : {}),
        ...(m.account != null && s(m.account) ? { account: s(m.account) } : {}),
        ...(m.type ? { type: s(m.type) } : {}),
      })),
  };
  return `${PUBLIC_BASE}${APPLY_PATH}#${b64urlEncodeJson(payload)}`;
}

/** Pure builders — unit-testable; button only (no raw URL / "copy this link" fallback). */
export function buildCustomerLinkEmailBodies({ link, prefill = {}, meters = [] } = {}) {
  const first = s(prefill.customer).split(/\s+/)[0] || "there";
  const address = s(prefill.serviceStreet);
  const meterCount = Array.isArray(meters) && meters.length ? meters.length : 1;
  // Levi 2026-08-03: not "5 minutes" / blank form — prefilled; customer reviews, approves, signs.
  const meterBit =
    meterCount > 1
      ? ` for your new meters (${meterCount})`
      : ` for your new meter`;
  const bodyText =
    `Hi ${first},\n\n` +
    `BLZ Electric is handling your Con Edison application for service` +
    (address ? ` at ${address}` : "") +
    `.\n\n` +
    `If you can, please review, approve, and sign the application${meterBit}. ` +
    `All the information is already filled in for you — you just need to review it and submit.\n\n` +
    `Please review the information and submit:\n${link}\n\n` +
    `When you finish, your completed application comes straight back to us and we file it with Con Edison for you.\n\n` +
    `Thank you!`;
  const esc = (x) =>
    String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Button only — Levi 2026-08-02: no "copy this link" / raw URL under the button.
  const bodyHtml =
    `<p>Hi ${esc(first)},</p>` +
    `<p>BLZ Electric is handling your <b>Con Edison application for service</b>` +
    (address ? ` at <b>${esc(address)}</b>` : "") +
    `.</p>` +
    `<p>If you can, please <b>review, approve, and sign</b> the application${esc(meterBit)}. ` +
    `All the information is already filled in for you — you just need to review it and submit.</p>` +
    `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#2d8a3e;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">Please review the information and submit</a></p>` +
    `<p>When you finish, your completed application comes straight back to us and we file it with Con Edison for you.</p>` +
    `<p>Thank you!</p>`;
  return { bodyText, bodyHtml, first, address };
}

/** Filename: address + apt/PLP; multi-meter adds "1 of 2". */
export function buildIntakeCompletedFileName({
  address = "",
  unit = "",
  meterIndex = 0,
  meterTotal = 1,
  fallback = "",
} = {}) {
  const clean = (v, max = 80) =>
    s(v)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, max);
  if (fallback && !address && !unit) {
    const f = clean(fallback, 180);
    return f.endsWith(".pdf") ? f : `${f || "Con-Ed-Form-A"}.pdf`;
  }
  const street = clean(address, 80) || "Service address";
  let unitBit = clean(unit, 40);
  if (/^plp$/i.test(unitBit)) unitBit = "PLP";
  const parts = [street];
  if (unitBit) parts.push(unitBit);
  const total = Math.max(1, Number(meterTotal) || 1);
  if (total > 1) {
    const n = Math.min(total, Math.max(1, (Number(meterIndex) || 0) + 1));
    parts.push(`${n} of ${total}`);
  }
  const base = parts.join(" - ") || "Con-Ed-Form-A";
  return base.endsWith(".pdf") ? base : `${base}.pdf`;
}

async function emailCustomerLink({ to, link, prefill = {}, meters = [] }) {
  const apiKey = s(process.env.RESEND_API_KEY);
  const { bodyText, bodyHtml, address } = buildCustomerLinkEmailBodies({
    link,
    prefill,
    meters,
  });
  const html = buildBrandedEmailHtml({
    bodyHtml,
    preheader: `Your Con Edison application${address ? " - " + address : ""} - personal fill link`,
  });
  const text = `${bodyText}\n\n${signatureText()}\n\n${POWERED_BY_LE_TEXT}`;
  if (!apiKey) return { ok: false, dryRun: true, reason: "no_api_key" };
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "BLZ Electric <office@leelectrical.us>",
      to: [s(to)],
      subject: `Your Con Edison application${address ? " - " + address : ""} — please review and submit`,
      html,
      text,
      attachments: [leLogoAttachment()],
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    return { ok: false, error: data?.message || `resend HTTP ${res.status}` };
  }
  return { ok: true, id: data?.id || "" };
}

/** Best-effort Drive copy into existing BLZ Electric Inc / Con Edison Applications. */
async function saveToBlzDrive({ pdfB64, filename }) {
  try {
    // Same-origin Pages Function — optional; never gates success.
    const base =
      typeof process !== "undefined" && process.env.URL
        ? String(process.env.URL).replace(/\/$/, "")
        : PUBLIC_BASE;
    const res = await fetch(`${base}/.netlify/functions/gdrive-save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "save",
        filename,
        pdfB64,
        // Use existing company folder tree — do not invent a new root.
        subfolder: "Con Edison Applications",
        // Prefer configured platform folder (shared BLZ root) when present.
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && (data.ok || data.skipped)) return data;
    return { ok: false, error: data?.error || `gdrive HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const op = s(body.op || "");
  const store = getStore("coned-intake");

  if (op === "request") {
    const jobId = s(body.jobId);
    if (!jobId) return json({ ok: false, error: "missing jobId" }, 400);
    const token = crypto.randomUUID().replace(/-/g, "");
    const prefill = body.prefill && typeof body.prefill === "object" ? body.prefill : {};
    const meters = Array.isArray(body.meters) ? body.meters : [];
    const to = s(body.to);
    const link = buildApplyLink({ token, jobId, prefill, meters });
    const record = {
      token,
      jobId,
      prefill: {
        customer: s(prefill.customer),
        serviceStreet: s(prefill.serviceStreet),
        serviceCity: s(prefill.serviceCity),
        serviceState: s(prefill.serviceState),
        serviceZip: s(prefill.serviceZip),
        phone: s(prefill.phone),
        email: s(prefill.email),
        contactName: s(prefill.contactName) || s(prefill.customer),
        businessName: s(prefill.businessName),
      },
      meters,
      to,
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(`req:${token}`, record);
    await store.setJSON(`reqjob:${jobId}`, {
      token,
      to,
      meters,
      sentAt: record.createdAt,
    });
    let emailed = { ok: false, skipped: true };
    if (body.sendEmail !== false && to) {
      try {
        emailed = await emailCustomerLink({ to, link, prefill, meters });
      } catch (err) {
        emailed = { ok: false, error: String(err?.message || err) };
      }
    }
    return json({ ok: true, token, link, emailed });
  }

  if (op === "submit") {
    const token = s(body.token);
    if (!token) return json({ ok: false, error: "missing token" }, 400);
    const reqRec = await store.get(`req:${token}`, { type: "json" }).catch(() => null);
    if (!reqRec || !reqRec.jobId) {
      return json({ ok: false, error: "bad_token" }, 403);
    }
    const jobId = reqRec.jobId;
    const meterLabel = s(body.meterLabel) || "meter";
    const answersIn =
      body.answers && typeof body.answers === "object" ? { ...body.answers } : {};
    const unit =
      s(answersIn.unit) ||
      s(body.unit) ||
      s(meterLabel) ||
      "";
    const address =
      s(answersIn.serviceStreet) ||
      s(reqRec.prefill?.serviceStreet) ||
      "";
    const meterTotal = Math.max(
      1,
      Number(body.meterTotal) ||
        (Array.isArray(reqRec.meters) && reqRec.meters.length) ||
        1
    );
    const meterIndex = Math.max(0, Number(body.meterIndex) || 0);
    const filename = buildIntakeCompletedFileName({
      address,
      unit,
      meterIndex,
      meterTotal,
      fallback: s(body.filename).replace(/[^\w .()&'-]/g, "_") || "Con Ed Form A.pdf",
    });
    const pdfB64 = s(body.pdfB64).replace(/\s+/g, "");
    if (!pdfB64) return json({ ok: false, error: "missing pdfB64" }, 400);
    let pdfBytes;
    try {
      pdfBytes = bytesFromBase64(pdfB64);
    } catch {
      return json({ ok: false, error: "bad base64" }, 400);
    }
    if (!pdfBytes.length) return json({ ok: false, error: "empty pdf" }, 400);
    if (pdfBytes.length > MAX_PDF_BYTES) return json({ ok: false, error: "pdf too large" }, 413);

    // Store the PDF where the Con Edison Application tab can serve it.
    const docKey = `cnint-${safeKeyPart(jobId, 18)}-${safeKeyPart(meterLabel, 12)}-${Date.now().toString(36)}`.slice(0, 73);
    const docs = getStore("docs");
    await docs.set(docKey, pdfBytes, {
      metadata: {
        mime: "application/pdf",
        bytes: pdfBytes.length,
        ts: Date.now(),
        filename,
      },
    });

    // Record the submission for the app to import (answers minus signature image).
    const answers = { ...answersIn };
    delete answers.signImage;
    const subKey = `sub:${jobId}`;
    const existing = (await store.get(subKey, { type: "json" }).catch(() => null)) || {
      jobId,
      meters: {},
    };
    existing.meters[meterLabel] = {
      meterLabel,
      answers,
      docKey,
      filename,
      submittedAt: new Date().toISOString(),
      meterIndex,
      meterTotal,
    };
    existing.updatedAt = new Date().toISOString();
    existing.token = token;
    await store.setJSON(subKey, existing);

    const jobStub = {
      customer: s(reqRec.prefill?.customer) || s(answers.accountName),
      serviceAddress: address,
      email: s(reqRec.prefill?.email) || s(answers.email) || s(reqRec.to),
    };

    // Office copy — branded email with the filled Form A attached.
    let officeEmail = { ok: false };
    try {
      officeEmail = await sendApplicationEmail({
        officeOnly: true,
        pdfB64,
        filename,
        subject:
          `Customer completed Con Ed application - ` +
          `${jobStub.customer || "customer"} - ` +
          `${address} (${meterLabel})`,
        message:
          `The customer just completed their Con Edison application` +
          ` (${meterLabel}) through their fill link.\n\n` +
          `File name: ${filename}\n` +
          `Saved under BLZ Electric Inc → Con Edison Applications (when Drive is available).\n\n` +
          `The filled Form A PDF is attached and is already saved on the job's ` +
          `Con Edison Application tab in ${PRODUCT_BRAND.name}. Open the job to review and ` +
          `submit it in the Con Edison portal.`,
        job: jobStub,
        application: { formTitle: "Con Edison Form A", copy: "office-intake" },
      });
    } catch (err) {
      officeEmail = { ok: false, error: String(err?.message || err) };
    }

    // Customer confirmation — office + customer both get a copy (Levi 2026-08-02).
    let customerEmail = { ok: false, skipped: true };
    const customerTo = s(jobStub.email);
    if (customerTo) {
      try {
        const first = s(jobStub.customer).split(/\s+/)[0] || "there";
        customerEmail = await sendApplicationEmail({
          to: customerTo,
          pdfB64,
          filename,
          subject: `Your Con Edison application - ${address || "service address"}`,
          message:
            `Hi ${first},\n\n` +
            `Your Con Edison application for service` +
            (address ? ` at ${address}` : "") +
            (unit ? ` (${unit})` : "") +
            ` is complete. Your signed application (Form A) is attached for your records.\n\n` +
            `BLZ Electric received a copy too and will file it with Con Edison for you.\n\n` +
            `Questions? Reply to this email or call (718) 594-1850.\n\nThank you!`,
          job: jobStub,
          application: { formTitle: "Con Edison Form A", copy: "customer-intake" },
        });
      } catch (err) {
        customerEmail = { ok: false, error: String(err?.message || err) };
      }
    }

    // Drive: existing BLZ Electric Inc / Con Edison Applications only — never invent a new root.
    let drive = { ok: false, skipped: true };
    try {
      drive = await saveToBlzDrive({ pdfB64, filename });
    } catch (err) {
      drive = { ok: false, error: String(err?.message || err) };
    }

    return json({
      ok: true,
      docKey,
      filename,
      officeEmailed: !!officeEmail.ok,
      customerEmailed: !!customerEmail.ok,
      drive,
    });
  }

  if (op === "check") {
    const jobId = s(body.jobId);
    if (!jobId) return json({ ok: false, error: "missing jobId" }, 400);
    const request = await store.get(`reqjob:${jobId}`, { type: "json" }).catch(() => null);
    const submission = await store.get(`sub:${jobId}`, { type: "json" }).catch(() => null);
    if (submission) delete submission.token;
    if (request) delete request.token;
    return json({ ok: true, request: request || null, submission: submission || null });
  }

  return json({ ok: false, error: "unknown op" }, 400);
};
