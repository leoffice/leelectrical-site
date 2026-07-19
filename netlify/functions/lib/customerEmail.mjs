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
export function buildCustomerEmailHtml(text, tenant = {}) {
  const brand = resolveEmailBrand(tenant);
  const body = String(text || "")
    .split("\n")
    .map((ln) => ln.trim())
    .join("<br>\n");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="padding:18px 24px;text-align:center;border-bottom:1px solid #e5e7eb;">
      <img src="${brand.logoSrc}" alt="${brand.name}" height="48" style="height:48px;display:block;margin:0 auto 8px;" />
      <div style="font-size:15px;font-weight:700;color:#066a34;">${brand.name}</div>
    </div>
    <div style="padding:22px 24px;font-size:14px;line-height:1.6;">${body}</div>
    ${poweredByLeHtml()}
  </div></body></html>`;
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
    text: `${text}\n\n${POWERED_BY_LE_TEXT}`,
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