import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./paymentConfirmEnv.mjs";
import { docPdfFilename, mapJobToQbDocData } from "./jobToQbDoc.mjs";
// Static ESM default-import of the CJS template (esbuild/Node interop) — no
// createRequire, which isn't available on Cloudflare's V8 isolate.
import emailTemplate from "./le-invoice-suite/email-template.js";
// Logo inlined as base64 — Cloudflare/V8 has no filesystem for readFileSync.
import { LOGO_PNG_BASE64 } from "./le-invoice-suite/logoBase64.mjs";
import { POWERED_BY_LE_TEXT, poweredByLeHtml, resolveEmailBrand } from "./emailBranding.mjs";
import { buildEmailPayLandingPayload, mintShortPayLink } from "./payLandingLink.mjs";

const { buildEmailHTML, buildPayLink } = emailTemplate;

const RESEND_URL = "https://api.resend.com/emails";
const SITE = "https://leelectrical.us";

/** During the test phase, the ONLY address a testSend/officeOnly call may reach. */
const OFFICE_EMAIL = "office@leelectrical.us";

function docsUrl(key) {
  return `${SITE}/.netlify/functions/docs?key=${encodeURIComponent(key)}`;
}

/** Decode a base64 (or data-URL) PDF the client generated into a Buffer. */
function decodePdfB64(b64) {
  const raw = String(b64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  // Sanity: a real PDF starts with "%PDF".
  return buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF" ? buf : null;
}

/**
 * Send invoice/estimate email with a PDF + QBO-style HTML via Resend.
 *
 * PDF source (in order): `pdfB64` — a client-generated qb-pdf PDF (Cloudflare/
 * V8-safe, no pdfkit) — else the server pdfkit generator (legacy; 502s today).
 *
 * Safety/diagnostics:
 *  - `probe:true`   → returns { hasResendKey, testMode, wouldSendTo, from } and
 *                     sends NOTHING. Lets us verify RESEND_API_KEY with zero risk.
 *  - `officeOnly:true` → hard-pins the recipient to office@leelectrical.us and
 *                     refuses to send anywhere else (test-phase guard).
 * Invoices with balance auto-include the View-and-Pay link unless suppressed.
 */
export async function sendDocEmail({
  job,
  kind = "invoice",
  to,
  includePaymentLink = true,
  pdfB64,
  filename: filenameIn,
  message = "",
  subject: subjectIn = "",
  probe = false,
  officeOnly = false,
}) {
  const email = String(to || job?.email || "").trim();

  // --- Safe diagnostics: report env/recipient without generating or sending ---
  if (probe) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const testMode = isEmailTestMode();
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey,
      testMode,
      from: resolveFromAddress(),
      wouldSendTo: officeOnly ? OFFICE_EMAIL : resolveRecipient(email) || "(unset)",
      testEmailConfigured: !!String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim(),
    };
  }

  if (!email && !officeOnly) return { ok: false, reason: "no_recipient" };

  // --- PDF: prefer the client-generated qb-pdf (no server pdfkit) ---
  const docData = mapJobToQbDocData(job, kind);
  let pdfBuffer = decodePdfB64(pdfB64);
  let docKey = "";
  if (!pdfBuffer) {
    // Client-PDF only. Server-side pdfkit generation is gone — it can't run on
    // Cloudflare's V8 isolate (and pulling docGenerate in would drag pdfkit into
    // the bundle). The browser always sends the qb-pdf as pdfB64. See the
    // generate-doc stub for the server-gen story.
    return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required" };
  }

  const isInvoice = kind === "invoice";
  const docWord = isInvoice ? "Invoice" : "Estimate";
  // The Cardknox URL is NEVER shown to the customer. It is embedded in the
  // landing payload so the PayLanding page can offer Pay; the email only ever
  // exposes a short /pay/<code> link behind one button.
  let cardknoxUrl = "";
  if (isInvoice && includePaymentLink && docData.amountDue > 0.01) {
    cardknoxUrl = buildPayLink({
      amount: docData.amountDue,
      invoiceNumber: docData.docNumber,
      customerName: docData.billTo.name,
      customerEmail: email,
    });
  }

// Prefer confirm-sheet body when provided; otherwise leave greeting empty
  // (HTML template still shows bill-to banner + CTA). Short pay link stays
  // the only customer-facing URL — never the raw Cardknox link.
  let viewLink = docKey ? docsUrl(docKey) : "";
  if (isInvoice) {
    const shortLink = await mintShortPayLink(
      buildEmailPayLandingPayload({ job, docData, email, cardknoxUrl })
    );
    if (shortLink) viewLink = shortLink;
  }

  const customTop = String(message || "").trim();
  // Header brand = tenant (company name + logo). Footer = constant Powered by LE.
  const brand = resolveEmailBrand({ name: docData.company?.name, logoUrl: docData.company?.logoUrl });
  const html = buildEmailHTML({
    ...docData,
    viewLink,
    // payLink intentionally omitted: one primary CTA only.
    logoSrc: brand.logoSrc,
    viewLabel: isInvoice ? "View Invoice" : "View Estimate",
    poweredByHtml: poweredByLeHtml(),
    topMessage: customTop || undefined,
    paymentMessage: isInvoice
      ? 'Other ways to pay:\n\n-Zelle: Send payment to Office@LeElectrical.us.\n-Check: Make checks payable to "BLZ Electric Inc." and either mail it or email a clear picture of the check to Office@LeElectrical.us.'
      : undefined,
  });

  // officeOnly hard-pins the recipient to office@ and refuses anything else —
  // the test-phase guard so a test send can NEVER reach a real customer.
  const recipient = officeOnly ? OFFICE_EMAIL : resolveRecipient(email);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subject =
    String(subjectIn || "").trim() || `${docWord} #${docData.docNumber} from ${docData.company.name}`;

  const meta = {
    testMode,
    officeOnly,
    intendedTo: email || OFFICE_EMAIL,
    to: recipient || "(unset)",
    from,
    subject,
    kind,
    docNumber: docData.docNumber,
  };

  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }

  const pdfAttachB64 = pdfBuffer.toString("base64");
  const filename = filenameIn || docPdfFilename(kind, job, docData.docNumber);

  const text =
    `${docWord} ${docData.docNumber} from ${docData.company.name}\n` +
    (isInvoice ? `Due ${docData.dueDate} — $${docData.amountDue}\n\n` : `Total — $${docData.amountDue}\n\n`) +
    (viewLink ? `View your invoice and pay: ${viewLink}` : "") +
    `\n\n${POWERED_BY_LE_TEXT}`;

  if (!apiKey) {
    console.log("[doc-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    // Not a successful send — client must surface this (was ok:true and looked "sent").
    return { ok: false, dryRun: true, reason: "no_api_key", viewLink, payLink: cardknoxUrl || "", ...meta };
  }

  const payload = {
    from: `${docData.company.name} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename, content: pdfAttachB64 },
      { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: "companylogo" },
    ],
  };
  if (testMode && email !== recipient) {
    payload.headers = { "X-Intended-Recipient": email };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[doc-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    console.log("[doc-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, viewLink, payLink: cardknoxUrl || "", docKey, ...meta };
  } catch (err) {
    console.error("[doc-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}