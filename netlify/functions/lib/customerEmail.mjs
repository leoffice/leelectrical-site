import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./paymentConfirmEnv.mjs";

const RESEND_URL = "https://api.resend.com/emails";
const COMPANY = "LE Electrical";

/**
 * Send a customer-facing email composed in LE Pro (Resend).
 * EMAIL_TEST_MODE=true routes to PAYMENT_CONFIRM_TEST_EMAIL.
 */
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

  const html = text
    .split("\n")
    .map((ln) => ln.trim())
    .join("<br>\n");

  const payload = {
    from: `${COMPANY} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subj}` : subj,
    html,
    text,
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