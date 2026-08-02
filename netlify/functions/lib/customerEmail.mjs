import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./paymentConfirmEnv.mjs";
import {
  POWERED_BY_LE_TEXT,
  leLogoAttachment,
  poweredByLeHtml,
  resolveEmailBrand,
  buildBrandedEmailHtml,
  signatureText,
} from "./emailBranding.mjs";

const RESEND_URL = "https://api.resend.com/emails";
const COMPANY = "LE Electrical";

/**
 * Send a customer-facing email composed in LE Pro (Resend).
 * EMAIL_TEST_MODE=true routes to PAYMENT_CONFIRM_TEST_EMAIL.
 */
/**
 * Branded shell for a plain-text customer email: tenant logo + name on top,
 * constant "Powered by LE" at the bottom. Body copy is untouched.
 */
export function buildCustomerEmailHtml(text, tenant = {}, signer = {}) {
  const body = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>\n");
  // Standard branded shell: letterhead header + body + Gmail-style signature + Powered-by.
  return buildBrandedEmailHtml({ bodyHtml: body, tenant, signer });
}

export async function sendCustomerEmail({ to, subject, message, customerEmail }) {
  const intended = String(customerEmail || to || "").trim();
  const recipient = resolveRecipient(intended || to);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subj = String(subject || "Message from LE Electrical").trim();
  const text = String(message || "").trim();

  const meta = {
    testMode,
    intendedTo: intended || "(unset)",
    to: recipient || "(unset)",
    from,
    subject: subj,
  };

  if (!text) {
    return { ok: false, skipped: true, reason: "empty_message", ...meta };
  }
  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (!apiKey) {
    console.log("[customer-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", ...meta };
  }

  const html = buildCustomerEmailHtml(text, { name: COMPANY });

  const payload = {
    from: `${COMPANY} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subj}` : subj,
    html,
    text: `${text}\n\n${signatureText()}\n\n${POWERED_BY_LE_TEXT}`,
    // Inline CID logo so the header mark renders without "display images".
    attachments: [leLogoAttachment()],
  };
  if (testMode && intended && intended !== recipient) {
    payload.headers = { "X-Intended-Recipient": intended };
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
      console.error("[customer-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    console.log("[customer-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, ...meta };
  } catch (err) {
    console.error("[customer-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}