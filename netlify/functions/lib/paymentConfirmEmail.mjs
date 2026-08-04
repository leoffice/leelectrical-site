// Payment confirmation email — body content only; wraps the APPROVED STANDARD
// branded shell (letterhead + Gmail-style signature + Powered by LE).
import {
  POWERED_BY_LE_TEXT,
  buildBrandedEmailHtml,
  signatureText,
} from "./emailBranding.mjs";

export const PAYMENT_CONFIRM_COMPANY = "BLZ Electric Inc.";

function parseMoney(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtMoneyPrecise(v) {
  const n = typeof v === "number" ? v : parseMoney(v);
  if (n == null || Number.isNaN(n)) return "";
  const abs = Math.abs(n);
  const str =
    abs % 1 === 0
      ? "$" + Math.round(abs).toLocaleString("en-US")
      : "$" +
        abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? "-" + str : str;
}

function fmtBalanceNow(bal) {
  if (bal == null || Number.isNaN(bal)) return "";
  if (bal <= 0.01) return "Paid in full";
  return fmtMoneyPrecise(bal);
}

function fmtPayDate(iso) {
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Body-only receipt block (swaps inside the standard shell). */
function buildPaymentConfirmBodyHtml({
  firstName,
  inv,
  amt,
  balance,
  dateStr,
  balanceNow,
  viewLink = "",
}) {
  const balanceClass = balanceNow != null && balanceNow <= 0.01 ? "#047857" : "#0f172a";
  const balLabel =
    balanceNow != null && Number(balanceNow) <= 0.01
      ? "Updated balance"
      : "Updated balance";
  const receiptRows = [
    inv
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">#${escapeHtml(inv)}</td></tr>`
      : "",
    amt
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#2563eb;font-size:16px;">${escapeHtml(amt)}</td></tr>`
      : "",
    `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">${escapeHtml(dateStr)}</td></tr>`,
    balance
      ? `<tr><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;color:#334155;font-weight:600;font-size:14px;">${balLabel}</td><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;color:${balanceClass};font-size:16px;">${escapeHtml(balance)}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const href = String(viewLink || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  const linkBlock = href
    ? `<div style="margin:20px 0 8px;text-align:center;">` +
      `<a href="${href}" style="display:inline-block;background:#066a34;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px;">View invoice</a>` +
      `</div>` +
      `<p style="margin:0 0 12px;text-align:center;font-size:13px;line-height:1.5;">` +
      `<a href="${href}" style="color:#066a34;font-weight:600;text-decoration:underline;">Updated balance &amp; transaction history</a>` +
      `</p>`
    : "";

  return (
    `<div style="text-align:center;margin:0 0 12px;">` +
    `<div style="font-size:42px;line-height:1;color:#16a34a;">✓</div>` +
    `<h1 style="margin:12px 0 20px;font-size:20px;font-weight:800;color:#0f172a;">Payment received</h1>` +
    `</div>` +
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#1f2937;">Hi ${escapeHtml(firstName || "there")},</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px;margin-bottom:12px;">` +
    receiptRows +
    `</table>` +
    linkBlock +
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">` +
    `Thank you. Your payment is applied to your invoice` +
    (balanceNow != null && Number(balanceNow) <= 0.01
      ? " — balance is now $0."
      : ".") +
    `</p>`
  );
}

/** Subject + HTML body for automatic payment confirmation email. */
export function buildPaymentConfirmEmail({
  firstName = "there",
  invoiceNo = "",
  amountPaid,
  balanceNow,
  payDate,
  tenant = {},
  viewLink = "",
} = {}) {
  const inv = String(invoiceNo || "").trim();
  const amt = fmtMoneyPrecise(amountPaid);
  const balance = fmtBalanceNow(balanceNow);
  const dateStr = fmtPayDate(payDate);
  const company = String(tenant.name || tenant.companyName || PAYMENT_CONFIRM_COMPANY).trim() || PAYMENT_CONFIRM_COMPANY;
  const link = String(viewLink || "").trim();

  const subject = inv
    ? `Payment received — Invoice #${inv} — ${company}`
    : `Payment received — ${company}`;

  const html = buildBrandedEmailHtml({
    bodyHtml: buildPaymentConfirmBodyHtml({
      firstName,
      inv,
      amt,
      balance,
      dateStr,
      balanceNow,
      viewLink: link,
    }),
    tenant: { name: company, logoUrl: tenant.logoUrl || tenant.logoSrc },
    preheader: inv ? `Payment received — Invoice #${inv}` : "Payment received — thank you",
  });

  const text = [
    `Hi ${firstName},`,
    "",
    "Payment received — thank you.",
    inv ? `Invoice #${inv}` : "",
    amt ? `Amount paid: ${amt}` : "",
    `Date: ${dateStr}`,
    balance ? `Updated balance: ${balance}` : "",
    link ? `View invoice: ${link}` : "",
    link ? `Updated balance & transaction history: ${link}` : "",
    "",
    "Your payment is applied to your invoice.",
    "",
    signatureText(),
    "",
    POWERED_BY_LE_TEXT,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text, company };
}
