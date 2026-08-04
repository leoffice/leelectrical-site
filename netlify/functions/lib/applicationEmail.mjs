/**
 * Agency application email — full field dump HTML + PDF attachment via Resend.
 * Used for Con Ed Form A and future agency apps.
 */
import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipients,
  parseEmailRecipients,
} from "./paymentConfirmEnv.mjs";
import {
  POWERED_BY_LE_TEXT,
  buildBrandedEmailHtml,
  signatureText,
  leLogoAttachment,
} from "./emailBranding.mjs";
import { OFFICE_EMAIL, applyOfficeBcc } from "./officeCopy.mjs";

function nl2brEsc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
}

const RESEND_URL = "https://api.resend.com/emails";

function decodePdfB64(b64) {
  const raw = String(b64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF" ? buf : null;
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {boolean} [opts.officeOnly]
 * @param {boolean} [opts.probe]
 * @param {string} opts.pdfB64
 * @param {string} [opts.filename]
 * @param {string} [opts.subject]
 * @param {string} [opts.message] plain text body
 * @param {string} [opts.htmlBody] full HTML body (preferred)
 * @param {object} [opts.job]
 * @param {object} [opts.application]
 */
export async function sendApplicationEmail({
  to,
  officeOnly = false,
  probe = false,
  pdfB64,
  filename = "application.pdf",
  subject: subjectIn = "",
  message = "",
  htmlBody = "",
  job = {},
  application = null,
} = {}) {
  const email = String(to || "").trim();
  const parsedList = parseEmailRecipients(email);

  if (probe) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey,
      testMode: isEmailTestMode(),
      from: resolveFromAddress(),
      wouldSendTo: officeOnly ? OFFICE_EMAIL : resolveRecipients(email).join(", ") || "(unset)",
      kind: "application",
    };
  }

  if (!parsedList.length && !officeOnly) return { ok: false, reason: "no_recipient" };

  const pdfBuffer = decodePdfB64(pdfB64);
  if (!pdfBuffer) return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required" };

  const recipients = officeOnly ? [OFFICE_EMAIL] : resolveRecipients(email);
  const recipient = recipients[0] || "";
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const formTitle =
    application?.formTitle || application?.agencyId || "Agency application";
  const cust = job?.customer || job?.customerName || "";
  const site = job?.serviceAddress || job?.address || "";
  const subject =
    String(subjectIn || "").trim() ||
    `${formTitle}${cust || site ? " — " + [cust, site].filter(Boolean).join(" · ") : ""}`;

  // Friendly customer-facing body (branded shell + signature wraps this).
  const firstName = String(cust || "").trim().split(/\s+/)[0] || "";
  const defaultBody =
    `Hi${firstName ? " " + firstName : ""},\n\n` +
    `Your Con Edison Application for Service${site ? " at " + site : ""} is complete. ` +
    `Your signed application (Form A) is attached to this email as a PDF for your records.\n\n` +
    `We'll take it from here and submit it to Con Edison. If we need anything else from you, we'll be in touch.\n\n` +
    `Thank you!`;
  const bodyText = String(message || "").trim() || defaultBody;

  const text = `${bodyText}\n\n${signatureText()}\n\n${POWERED_BY_LE_TEXT}`;

  // Use the provided htmlBody as INNER body only if it's not a full document;
  // otherwise render the friendly text. Either way it gets the branded header +
  // Gmail-style signature + Powered-by footer.
  const providedInner =
    String(htmlBody || "").trim() && !/<html[\s>]/i.test(htmlBody) ? htmlBody : "";
  const html = buildBrandedEmailHtml({
    bodyHtml: providedInner || nl2brEsc(bodyText),
    preheader: `${formTitle}${site ? " — " + site : ""}`,
  });

  const meta = {
    testMode: isEmailTestMode(),
    officeOnly,
    intendedTo: email || OFFICE_EMAIL,
    to: recipients.length ? recipients.join(", ") : "(unset)",
    recipients,
    from,
    subject,
    kind: "application",
  };

  if (!recipients.length) {
    return { ok: false, skipped: true, reason: "no_recipient", ...meta };
  }
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }

  if (!apiKey) {
    return {
      ok: false,
      dryRun: true,
      reason: "no_api_key",
      html,
      text,
      ...meta,
    };
  }

  const payload = {
    from,
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject,
    html,
    text,
    attachments: [
      leLogoAttachment(), // inline CID logo for the header + signature
      {
        filename: String(filename || "application.pdf").replace(/[^\w .-]/g, "_"),
        content: pdfBuffer.toString("base64"),
      },
    ],
  };
  // Levi 2026-08-03: customer Form A / application emails → office@ copy → Case tab.
  applyOfficeBcc(payload, {
    recipients,
    officeOnly,
    testMode: isEmailTestMode(),
  });

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "resend_error",
      error: data?.message || `Resend HTTP ${res.status}`,
      ...meta,
    };
  }
  return { ok: true, id: data?.id || "", ...meta };
}
