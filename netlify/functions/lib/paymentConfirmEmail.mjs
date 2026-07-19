import { poweredByLeHtml } from "./emailBranding.mjs";

const SITE = "https://leelectrical.us";
const LOGO = `${SITE}/app/pro/le-logo.png?v=5`;
export const PAYMENT_CONFIRM_COMPANY = "BLZ Electric";
const COMPANY = PAYMENT_CONFIRM_COMPANY;
const TAGLINE = "Brooklyn, NY · Licensed & insured";

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

/** Subject + HTML body for automatic payment confirmation email. */
export function buildPaymentConfirmEmail({
  firstName = "there",
  invoiceNo = "",
  amountPaid,
  balanceNow,
  payDate,
}) {
  const inv = String(invoiceNo || "").trim();
  const amt = fmtMoneyPrecise(amountPaid);
  const balance = fmtBalanceNow(balanceNow);
  const dateStr = fmtPayDate(payDate);
  const balanceClass = balanceNow != null && balanceNow <= 0.01 ? "#047857" : "#0f172a";

  const subject = inv
    ? `Payment received — Invoice #${inv} — ${COMPANY}`
    : `Payment received — ${COMPANY}`;

  const receiptRows = [
    inv
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">#${escapeHtml(inv)}</td></tr>`
      : "",
    amt
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#2563eb;font-size:16px;">${escapeHtml(amt)}</td></tr>`
      : "",
    `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">${escapeHtml(dateStr)}</td></tr>`,
    balance
      ? `<tr><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;color:#334155;font-weight:600;font-size:14px;">Balance now</td><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;color:${balanceClass};font-size:16px;">${escapeHtml(balance)}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:#ffffff;border-bottom:1px solid #e2e8f0;padding:28px 24px;text-align:center;">
          <img src="${LOGO}" alt="${COMPANY}" width="200" style="display:block;margin:0 auto 16px;max-width:100%;height:auto;" />
          <div style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${COMPANY}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${TAGLINE}</div>
        </td></tr>
        <tr><td style="padding:28px 24px;text-align:center;">
          <div style="font-size:42px;line-height:1;margin-bottom:12px;color:#16a34a;">✓</div>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#0f172a;">Payment received</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px;margin-bottom:20px;">
            ${receiptRows}
          </table>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
            Thank you. Your payment is being applied to your invoice and will appear in our records shortly.
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;text-align:center;font-size:11px;color:#64748b;">
          <a href="${SITE}" style="color:#64748b;text-decoration:none;">leelectrical.us</a>
        </td></tr>
        <tr><td style="padding:0;">${poweredByLeHtml()}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${firstName},`,
    "",
    "Payment received — thank you.",
    inv ? `Invoice #${inv}` : "",
    amt ? `Amount paid: ${amt}` : "",
    `Date: ${dateStr}`,
    balance ? `Balance now: ${balance}` : "",
    "",
    "Your payment is being applied to your invoice.",
    "",
    COMPANY,
    SITE,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text, company: COMPANY };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}