import { fmt$ } from "./format.js";
import { invoiceTotal, openBalance } from "./customers.js";
import { fmtMoneyPrecise, totalWithFee } from "./payFees.js";

/** Default subject/body for payment-link customer email. */
export function buildPaymentLinkEmail({ job, url, linkAmount, inv }) {
  const first = (job.customer || "").split(" ")[0] || "there";
  const total = invoiceTotal(job);
  const due = openBalance(job);
  const linkAmt = parseFloat(String(linkAmount).replace(/[$,]/g, "")) || due;
  const totalStr = total > 0 ? fmt$(total) : job.amount || "—";
  const dueStr = due > 0 ? fmt$(due) : totalStr;
  const linkStr = fmt$(linkAmt) || String(linkAmount);
  const chargeStr = fmtMoneyPrecise(totalWithFee(linkAmt));
  const work = (job.title || job.serviceType || "your electrical work").trim();

  const subject = `Invoice #${inv} — View & Pay — BLZ Electric`;

  const body = [
    `Hi ${first},`,
    "",
    `Invoice #${inv} for ${work} (BLZ Electric).`,
    `Invoice total: ${totalStr}. Balance due: ${dueStr}.`,
    "",
    "View your invoice and pay securely online:",
    "",
    `▶  VIEW & PAY INVOICE`,
    url,
    "",
    `Suggested payment: ${linkStr} (+ 3.5% processing fee → ${chargeStr} total charge).`,
    "You can adjust the amount on the invoice page before paying.",
    "",
    "Thank you,",
    "BLZ Electric",
    "leelectrical.us",
  ].join("\n");

  return { subject, body, first };
}