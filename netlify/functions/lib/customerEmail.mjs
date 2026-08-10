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
  COMPANY_INFO,
  DEFAULT_BRAND_NAME,
} from "./emailBranding.mjs";
import { applyOfficeBcc } from "./officeCopy.mjs";

const RESEND_URL = "https://api.resend.com/emails";
/** Account company on the letterhead — Levi's BLZ Electric, not the LE product name. */
const COMPANY = COMPANY_INFO?.name || DEFAULT_BRAND_NAME || "BLZ Electric Inc.";

/**
 * Send a customer-facing email composed in LE Pro (Resend).
 * EMAIL_TEST_MODE=true routes to PAYMENT_CONFIRM_TEST_EMAIL.
 */
/**
 * Branded shell for a plain-text customer email: tenant logo + name on top,
 * constant "Powered by LE" at the bottom. Body copy is untouched.
 */
export function buildCustomerEmailHtml(text, tenant = {}, signer = {}, cta = null) {
  const body = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>\n");
  let ctaHtml = "";
  const label = String(cta?.label || "").trim();
  const href = String(cta?.url || "").trim();
  if (label && href) {
    const safeHref = href
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    const safeLabel = label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    ctaHtml =
      `<div style="margin:24px 0 8px;text-align:center;">` +
      `<a href="${safeHref}" style="display:inline-block;background:#066a34;color:#ffffff;` +
      `font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;` +
      `text-decoration:none;padding:14px 28px;border-radius:8px;">${safeLabel}</a></div>`;
  }
  // Standard branded shell: letterhead header + body + Gmail-style signature + Powered-by.
  // Tenant name defaults to BLZ Electric Inc. (account company), not "LE Electrical".
  const brand = resolveEmailBrand({
    name: tenant.name || tenant.companyName || COMPANY,
    ...tenant,
  });
  return buildBrandedEmailHtml({
    bodyHtml: body + ctaHtml,
    tenant: { name: brand.name, logoSrc: brand.logoSrc },
    signer,
  });
}

export async function sendCustomerEmail({
  to,
  subject,
  message,
  customerEmail,
  companyName,
  ctaLabel,
  ctaUrl,
  /** Optional pre-built INNER html (table, bold facts). Still wrapped in branded shell. */
  htmlBody,
}) {
  const intended = String(customerEmail || to || "").trim();
  const recipient = resolveRecipient(intended || to);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const company = String(companyName || COMPANY).trim() || COMPANY;
  const subj = String(subject || `Message from ${company}`).trim();
  const text = String(message || "").trim();
  const innerHtml = String(htmlBody || "").trim();
  // Reject full documents — only inner body fragments (same rule as application mail).
  const safeInner =
    innerHtml && !/<html[\s>]/i.test(innerHtml) && !/<!doctype/i.test(innerHtml)
      ? innerHtml
      : "";

  const meta = {
    testMode,
    intendedTo: intended || "(unset)",
    to: recipient || "(unset)",
    from,
    company,
    subject: subj,
  };

  if (!text && !safeInner) {
    return { ok: false, skipped: true, reason: "empty_message", ...meta };
  }
  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (!apiKey) {
    console.log("[customer-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", ...meta };
  }

  const cta = ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : null;
  let html;
  if (safeInner) {
    // Same branded shell as Con Ed application-complete / invoice mail.
    let ctaHtml = "";
    const label = String(cta?.label || "").trim();
    const href = String(cta?.url || "").trim();
    if (label && href) {
      const safeHref = href
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      const safeLabel = label
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      ctaHtml =
        `<div style="margin:24px 0 8px;text-align:center;">` +
        `<a href="${safeHref}" style="display:inline-block;background:#066a34;color:#ffffff;` +
        `font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;` +
        `text-decoration:none;padding:14px 28px;border-radius:8px;">${safeLabel}</a></div>`;
    }
    const brand = resolveEmailBrand({
      name: company,
    });
    html = buildBrandedEmailHtml({
      bodyHtml: safeInner + ctaHtml,
      tenant: { name: brand.name, logoSrc: brand.logoSrc },
      signer: {},
    });
  } else {
    html = buildCustomerEmailHtml(text, { name: company }, {}, cta);
  }

  // Levi 2026-08-03: always keep an office copy of outbound customer mail
  // so Gmail can file it under LE Pro labels (Messages / Case / etc.).
  const officeCopy = String(from || "office@leelectrical.us").trim().toLowerCase();
  const payload = {
    from: `${company} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subj}` : subj,
    html,
    text: `${text}\n\n${signatureText()}\n\n${POWERED_BY_LE_TEXT}`,
    // Inline CID logo so the header mark renders without "display images".
    attachments: [leLogoAttachment()],
  };
  if (officeCopy && officeCopy !== String(recipient).toLowerCase()) {
    payload.bcc = [officeCopy];
  }
  if (testMode && intended && intended !== recipient) {
    payload.headers = { "X-Intended-Recipient": intended };
  }
  // Levi 2026-08-03: every LE Pro message leaves a silent office@ copy for Gmail tabs.
  applyOfficeBcc(payload, { recipients: [recipient], testMode });

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