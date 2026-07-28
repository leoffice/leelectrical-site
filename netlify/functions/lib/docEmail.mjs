import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
  resolveRecipients,
  parseEmailRecipients,
} from "./paymentConfirmEnv.mjs";
import { docPdfFilename, docStoreKey, mapJobToQbDocData } from "./jobToQbDoc.mjs";
// Static ESM default-import of the CJS template (esbuild/Node interop) — no
// createRequire, which isn't available on Cloudflare's V8 isolate.
import emailTemplate from "./le-invoice-suite/email-template.js";
// Logo inlined as base64 — Cloudflare/V8 has no filesystem for readFileSync.
import { LOGO_PNG_BASE64 } from "./le-invoice-suite/logoBase64.mjs";
import { POWERED_BY_LE_TEXT, poweredByLeHtml, resolveEmailBrand } from "./emailBranding.mjs";
import { buildEmailPayLandingPayload, mintShortPayLink } from "./payLandingLink.mjs";
import { getStore } from "./storage/index.mjs";

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
 * Persist the emailed PDF so the pay-page "View invoice" button can open it.
 * Without this, the short /pay link lands but the PDF lookup 404s (or tries
 * the dead pdfkit path on Cloudflare).
 */
async function storePdfForView(kind, docNumber, pdfBuffer, filename) {
  const no = String(docNumber || "").trim();
  if (!no || !pdfBuffer?.length) return "";
  const key = docStoreKey(kind, no);
  try {
    const store = getStore("docs");
    await store.set(key, pdfBuffer, {
      metadata: {
        mime: "application/pdf",
        bytes: pdfBuffer.length,
        ts: Date.now(),
        source: "email",
        filename: String(filename || "").replace(/[^\w .-]/g, "_") || undefined,
      },
    });
    return key;
  } catch (err) {
    console.error("[doc-email] store pdf failed", err);
    return "";
  }
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
  const parsedList = parseEmailRecipients(email);

  // --- Safe diagnostics: report env/recipient without generating or sending ---
  if (probe) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const testMode = isEmailTestMode();
    const would = officeOnly
      ? OFFICE_EMAIL
      : (resolveRecipients(email).join(", ") || "(unset)");
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey,
      testMode,
      from: resolveFromAddress(),
      wouldSendTo: would,
      recipientCount: officeOnly ? 1 : resolveRecipients(email).length,
      testEmailConfigured: !!String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim(),
    };
  }

  if (!parsedList.length && !officeOnly) return { ok: false, reason: "no_recipient" };

  // --- PDF: prefer the client-generated qb-pdf (no server pdfkit) ---
  const docData = mapJobToQbDocData(job, kind);
  let pdfBuffer = decodePdfB64(pdfB64);
  if (!pdfBuffer) {
    // Client-PDF only. Server-side pdfkit generation is gone — it can't run on
    // Cloudflare's V8 isolate (and pulling docGenerate in would drag pdfkit into
    // the bundle). The browser always sends the qb-pdf as pdfB64. See the
    // generate-doc stub for the server-gen story.
    return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required" };
  }

  const isInvoice = kind === "invoice";
  const docWord = isInvoice ? "Invoice" : "Estimate";
  const filename = filenameIn || docPdfFilename(kind, job, docData.docNumber);
  // Store the same PDF the email attaches so pay-page "View invoice" works.
  const docKey = await storePdfForView(kind, docData.docNumber, pdfBuffer, filename);

  // The Cardknox URL is NEVER shown to the customer. It is embedded in the
  // landing payload so the PayLanding page can offer Pay; the email only ever
  // exposes a short /pay/<code> link behind one button.
  // Pay-link form only needs one contact email — use the first recipient.
  const primaryEmail = parsedList[0] || resolveRecipient(email) || email;
  let cardknoxUrl = "";
  if (isInvoice && includePaymentLink && docData.amountDue > 0.01) {
    cardknoxUrl = buildPayLink({
      amount: docData.amountDue,
      invoiceNumber: docData.docNumber,
      customerName: docData.billTo.name,
      customerEmail: primaryEmail,
    });
  }

  // Prefer confirm-sheet body when provided; otherwise leave greeting empty
  // (HTML template still shows bill-to banner + CTA). Short /pay link stays
  // the only customer-facing URL — never the raw Cardknox link.
  // Invoices → View & Pay landing. Estimates → View and Approve landing.
  let viewLink = docKey ? docsUrl(docKey) : "";
  const shortLink = await mintShortPayLink(
    buildEmailPayLandingPayload({
      job,
      docData,
      email: primaryEmail,
      cardknoxUrl: isInvoice ? cardknoxUrl : "",
      kind: isInvoice ? "invoice" : "estimate",
    })
  );
  if (shortLink) viewLink = shortLink;

  const customTop = String(message || "").trim();
  // Header brand = tenant (company name + logo). Footer = constant Powered by LE.
  const brand = resolveEmailBrand({ name: docData.company?.name, logoUrl: docData.company?.logoUrl });
  // Payment methods: Zelle, then credit-card Link (same short pay page), then Check.
  // "Link" is a real <a> to viewLink — never the raw Cardknox URL.
  let paymentMessage;
  let paymentMessageHtml;
  if (isInvoice) {
    const zelle = "Zelle: Send payment to Office@LeElectrical.us.";
    const check =
      'Check: Make checks payable to "BLZ Electric Inc." and either mail it or email a clear picture of the check to Office@LeElectrical.us.';
    if (viewLink) {
      paymentMessage =
        "Other ways to pay:\n\n-" +
        zelle +
        "\n-Credit card: Pay with credit card by pressing the following Link\n-" +
        check;
      paymentMessageHtml =
        "Other ways to pay:<br><br>" +
        "-" +
        zelle +
        "<br>" +
        '-Credit card: Pay with credit card by pressing the following <a href="' +
        String(viewLink).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
        '" style="color:#066a34;font-weight:bold;text-decoration:underline;">Link</a><br>' +
        "-" +
        check;
    } else {
      paymentMessage = "Other ways to pay:\n\n-" + zelle + "\n-" + check;
    }
  }
  const html = buildEmailHTML({
    ...docData,
    viewLink,
    // payLink intentionally omitted: one primary CTA only (View Invoice / View and Approve).
    logoSrc: brand.logoSrc,
    viewLabel: isInvoice ? "View Invoice" : "View and Approve",
    poweredByHtml: poweredByLeHtml(),
    topMessage: customTop || undefined,
    paymentMessage,
    paymentMessageHtml,
  });

  // officeOnly hard-pins the recipient to office@ and refuses anything else —
  // the test-phase guard so a test send can NEVER reach a real customer.
  // Multi-address "to" fields (comma/semicolon) become a proper Resend array.
  const recipients = officeOnly ? [OFFICE_EMAIL] : resolveRecipients(email);
  const recipient = recipients[0] || "";
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subject =
    String(subjectIn || "").trim() || `${docWord} #${docData.docNumber} from ${docData.company.name}`;

  const meta = {
    testMode,
    officeOnly,
    intendedTo: email || OFFICE_EMAIL,
    to: recipients.length ? recipients.join(", ") : "(unset)",
    recipients,
    from,
    subject,
    kind,
    docNumber: docData.docNumber,
  };

  if (!recipients.length) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }

  const pdfAttachB64 = pdfBuffer.toString("base64");

  const text =
    `${docWord} ${docData.docNumber} from ${docData.company.name}\n` +
    (isInvoice ? `Due ${docData.dueDate} — $${docData.amountDue}\n\n` : `Total — $${docData.amountDue}\n\n`) +
    (viewLink
      ? isInvoice
        ? `View your invoice and pay: ${viewLink}`
        : `View and approve your estimate: ${viewLink}`
      : "") +
    `\n\n${POWERED_BY_LE_TEXT}`;

  if (!apiKey) {
    console.log("[doc-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    // Not a successful send — client must surface this (was ok:true and looked "sent").
    // Include html + viewLink so host Gmail fallback can still ship the full layout.
    return {
      ok: false,
      dryRun: true,
      reason: "no_api_key",
      viewLink,
      payLink: cardknoxUrl || "",
      html,
      text,
      ...meta,
    };
  }

  const payload = {
    from: `${docData.company.name} <${from}>`,
    to: recipients,
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename, content: pdfAttachB64 },
      { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: "companylogo" },
    ],
  };
  // Levi 2026-07-22: silent office copy of every real customer invoice/estimate
  // so Gmail can file it under the "LE Pro" tab (host labeler + optional filter).
  // Skip when already sending only to office / test redirect / officeOnly.
  const officeLc = OFFICE_EMAIL.toLowerCase();
  const sendingToOfficeOnly =
    recipients.length === 1 && String(recipients[0] || "").toLowerCase() === officeLc;
  if (!officeOnly && !testMode && recipients.length && !sendingToOfficeOnly) {
    payload.bcc = [OFFICE_EMAIL];
  }
  if (testMode && email && recipients[0] && email.toLowerCase() !== String(recipients[0]).toLowerCase()) {
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
      return {
        ok: false,
        reason: "resend_error",
        status: res.status,
        error: body,
        viewLink,
        payLink: cardknoxUrl || "",
        html,
        text,
        ...meta,
      };
    }
    console.log("[doc-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, viewLink, payLink: cardknoxUrl || "", docKey, ...meta };
  } catch (err) {
    console.error("[doc-email] fetch failed", err);
    return {
      ok: false,
      reason: "fetch_failed",
      error: String(err?.message || err),
      viewLink,
      payLink: cardknoxUrl || "",
      html,
      text,
      ...meta,
    };
  }
}