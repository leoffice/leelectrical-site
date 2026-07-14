import { createRequire } from "module";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./paymentConfirmEnv.mjs";
import { generateAndStoreDoc } from "./docGenerate.mjs";
import { mapJobToQbDocData } from "./jobToQbDoc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { buildEmailHTML, buildPayLink } = require("./le-invoice-suite/email-template.js");

const RESEND_URL = "https://api.resend.com/emails";
const SITE = "https://leelectrical.us";
const SUITE_DIR = path.join(__dirname, "le-invoice-suite");

function docsUrl(key) {
  return `${SITE}/.netlify/functions/docs?key=${encodeURIComponent(key)}`;
}

/**
 * Send invoice/estimate email with locally generated PDF + QBO-style HTML.
 * Invoices with balance auto-include View and Pay link unless payLink omitted.
 */
export async function sendDocEmail({ job, kind = "invoice", to, includePaymentLink = true }) {
  const email = String(to || job?.email || "").trim();
  if (!email) return { ok: false, reason: "no_recipient" };

  const gen = await generateAndStoreDoc({ job, kind });
  if (!gen.ok) return { ok: false, reason: gen.reason || "pdf_failed" };

  const docData = mapJobToQbDocData(job, kind);
  const isInvoice = kind === "invoice";
  const docWord = isInvoice ? "Invoice" : "Estimate";
  const viewLink = docsUrl(gen.key);

  let payLink;
  if (isInvoice && includePaymentLink && docData.amountDue > 0.01) {
    payLink = buildPayLink({
      amount: docData.amountDue,
      invoiceNumber: docData.docNumber,
      customerName: docData.billTo.name,
      customerEmail: email,
    });
  }

  const html = buildEmailHTML({
    ...docData,
    viewLink,
    payLink,
    logoSrc: "cid:companylogo",
    topMessage: isInvoice && payLink
      ? `You can pay this invoice securely online:\n${payLink}\n\nThank you — BLZ Electric`
      : undefined,
    paymentMessage: isInvoice
      ? 'To make a payment, please follow one of these options:\n\nOnline Payment: Click the "View invoice" button in the email and pay via the provided credit card payment link.\n-Zelle: Send payment to Office@LeElectrical.us.\n-Check: Make checks payable to "BLZ Electric Inc." and either: Mail it or Email a clear picture of the check to Office@LeElectrical.us.'
      : undefined,
  });

  const recipient = resolveRecipient(email);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subject = `${docWord} #${docData.docNumber} from ${docData.company.name}`;

  const meta = {
    testMode,
    intendedTo: email,
    to: recipient || "(unset)",
    from,
    subject,
    kind,
    docNumber: docData.docNumber,
  };

  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }

  const logoBuf = readFileSync(path.join(SUITE_DIR, "assets", "logo.png"));
  const pdfB64 = gen.pdfBuffer.toString("base64");
  const filename = `${docWord}_${docData.docNumber}_from_BLZ_Electric.pdf`;

  const text =
    `${docWord} ${docData.docNumber} from ${docData.company.name}\n` +
    (isInvoice ? `Due ${docData.dueDate} — $${docData.amountDue}\n\n` : `Total — $${docData.amountDue}\n\n`) +
    (payLink ? `Pay online: ${payLink}\n\n` : "") +
    `View PDF: ${viewLink}`;

  if (!apiKey) {
    console.log("[doc-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", viewLink, payLink: payLink || "", ...meta };
  }

  const payload = {
    from: `${docData.company.name} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename, content: pdfB64 },
      { filename: "logo.png", content: logoBuf.toString("base64"), content_id: "companylogo" },
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
    return { ok: true, sent: true, resendId: body.id, viewLink, payLink: payLink || "", docKey: gen.key, ...meta };
  } catch (err) {
    console.error("[doc-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}