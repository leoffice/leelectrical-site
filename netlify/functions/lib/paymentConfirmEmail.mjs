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

/**
 * Progress / partial invoice → "Deposit received"; fully settled → "Payment received".
 * Levi 2026-08-05: only paid in full when balance is ~0 (or qty/pct is 100%).
 */
export function paymentReceiptHeadline({
  balanceNow,
  isDeposit,
  invoiceProgressPct,
  lineQtys = [],
} = {}) {
  if (isDeposit === true) return "Deposit received";
  if (isDeposit === false && balanceNow != null && Number(balanceNow) <= 0.01) {
    return "Payment received";
  }
  const pct = Number(invoiceProgressPct);
  if (Number.isFinite(pct) && pct > 0 && pct < 99.99) return "Deposit received";
  const partialQty = (lineQtys || []).some((q) => {
    const n = Number(q);
    return Number.isFinite(n) && n > 0 && n < 0.999;
  });
  if (partialQty) return "Deposit received";
  if (balanceNow != null && Number(balanceNow) > 0.01) return "Deposit received";
  return "Payment received";
}

/** Body-only receipt block (swaps inside the standard shell). */
function buildPaymentConfirmBodyHtml({
  firstName,
  inv,
  amt,
  appliedAmt,
  totalCharged,
  feeAmt,
  balance,
  dateStr,
  balanceNow,
  viewLink = "",
  headline = "Payment received",
}) {
  const balanceClass = balanceNow != null && balanceNow <= 0.01 ? "#047857" : "#0f172a";
  const balLabel =
    balanceNow != null && Number(balanceNow) <= 0.01
      ? "Updated balance"
      : "Updated balance";

  // Levi 2026-08-05: show total charged (with fee) AND amount applied to invoice as two lines.
  const applied = appliedAmt || amt;
  const total = totalCharged || (feeAmt && applied ? null : amt);
  const rows = [];
  if (inv) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">#${escapeHtml(inv)}</td></tr>`
    );
  }
  if (applied) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Applied to invoice</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#2563eb;font-size:16px;">${escapeHtml(applied)}</td></tr>`
    );
  }
  if (feeAmt) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Processing fee</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">${escapeHtml(feeAmt)}</td></tr>`
    );
  }
  if (total && total !== applied) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Total amount paid</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#0f172a;font-size:16px;">${escapeHtml(total)}</td></tr>`
    );
  } else if (applied && !feeAmt) {
    // Single amount still labeled as total when no fee split
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Total amount paid</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#2563eb;font-size:16px;">${escapeHtml(applied)}</td></tr>`
    );
  }
  rows.push(
    `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">${escapeHtml(dateStr)}</td></tr>`
  );
  if (balance) {
    rows.push(
      `<tr><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;color:#334155;font-weight:600;font-size:14px;">${balLabel}</td><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;color:${balanceClass};font-size:16px;">${escapeHtml(balance)}</td></tr>`
    );
  }
  const receiptRows = rows.join("");

  const href = String(viewLink || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  // One CTA only (Levi 2026-08-04) — two lines in one button, not a second link.
  const linkBlock = href
    ? `<div style="margin:20px 0 16px;text-align:center;">` +
      `<a href="${href}" style="display:inline-block;background:#066a34;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;line-height:1.35;min-width:220px;">` +
      `<span style="display:block;font-size:16px;">View invoice</span>` +
      `<span style="display:block;font-size:12px;font-weight:600;opacity:0.92;margin-top:4px;">Updated balance &amp; transaction history</span>` +
      `</a>` +
      `</div>`
    : "";

  const thanks =
    headline === "Deposit received"
      ? `Thank you. Your deposit is applied to your invoice` +
        (balanceNow != null && Number(balanceNow) <= 0.01
          ? " — balance is now $0."
          : balanceNow != null
            ? ` — remaining balance ${fmtBalanceNow(balanceNow)}.`
            : ".")
      : `Thank you. Your payment is applied to your invoice` +
        (balanceNow != null && Number(balanceNow) <= 0.01
          ? " — balance is now $0."
          : ".");

  return (
    `<div style="text-align:center;margin:0 0 12px;">` +
    `<div style="font-size:42px;line-height:1;color:#16a34a;">✓</div>` +
    `<h1 style="margin:12px 0 20px;font-size:20px;font-weight:800;color:#0f172a;">${escapeHtml(headline)}</h1>` +
    `</div>` +
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#1f2937;">Hi ${escapeHtml(firstName || "there")},</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px;margin-bottom:12px;">` +
    receiptRows +
    `</table>` +
    linkBlock +
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">` +
    thanks +
    `</p>`
  );
}

/** Subject + HTML body for automatic payment confirmation email. */
export function buildPaymentConfirmEmail({
  firstName = "there",
  invoiceNo = "",
  amountPaid,
  /** Amount applied to the invoice (before processing fee). Defaults to amountPaid. */
  amountApplied,
  /** Total charged including fee (card). */
  totalCharged,
  /** Processing fee amount only. */
  processingFee,
  balanceNow,
  payDate,
  tenant = {},
  viewLink = "",
  /** Force deposit wording (progress / partial). */
  isDeposit,
  invoiceProgressPct,
  lineQtys,
} = {}) {
  const inv = String(invoiceNo || "").trim();
  const appliedN =
    amountApplied != null && amountApplied !== ""
      ? parseMoney(amountApplied)
      : parseMoney(amountPaid);
  const feeN = processingFee != null && processingFee !== "" ? parseMoney(processingFee) : null;
  let totalN =
    totalCharged != null && totalCharged !== "" ? parseMoney(totalCharged) : null;
  if (totalN == null && appliedN != null && feeN != null) totalN = appliedN + feeN;
  if (totalN == null) totalN = appliedN;

  const applied = fmtMoneyPrecise(appliedN);
  const feeAmt = feeN != null && feeN > 0.001 ? fmtMoneyPrecise(feeN) : "";
  const total = fmtMoneyPrecise(totalN);
  const balance = fmtBalanceNow(balanceNow);
  const dateStr = fmtPayDate(payDate);
  const company =
    String(tenant.name || tenant.companyName || PAYMENT_CONFIRM_COMPANY).trim() ||
    PAYMENT_CONFIRM_COMPANY;
  const link = String(viewLink || "").trim();

  const headline = paymentReceiptHeadline({
    balanceNow,
    isDeposit,
    invoiceProgressPct,
    lineQtys,
  });

  const subject = inv
    ? `${headline} — Invoice #${inv} — ${company}`
    : `${headline} — ${company}`;

  const html = buildBrandedEmailHtml({
    bodyHtml: buildPaymentConfirmBodyHtml({
      firstName,
      inv,
      amt: applied,
      appliedAmt: applied,
      totalCharged: total,
      feeAmt,
      balance,
      dateStr,
      balanceNow,
      viewLink: link,
      headline,
    }),
    tenant: { name: company, logoUrl: tenant.logoUrl || tenant.logoSrc },
    preheader: inv ? `${headline} — Invoice #${inv}` : `${headline} — thank you`,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `${headline} — thank you.`,
    inv ? `Invoice #${inv}` : "",
    applied ? `Applied to invoice: ${applied}` : "",
    feeAmt ? `Processing fee: ${feeAmt}` : "",
    total && total !== applied ? `Total amount paid: ${total}` : applied ? `Total amount paid: ${applied}` : "",
    `Date: ${dateStr}`,
    balance ? `Updated balance: ${balance}` : "",
    link ? `View invoice / updated balance & transaction history: ${link}` : "",
    "",
    headline === "Deposit received"
      ? "Your deposit is applied to your invoice."
      : "Your payment is applied to your invoice.",
    "",
    signatureText(),
    "",
    POWERED_BY_LE_TEXT,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text, company, headline };
}
