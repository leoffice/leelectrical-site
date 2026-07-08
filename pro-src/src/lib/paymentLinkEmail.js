import { fmt$ } from "./format.js";
import { invoiceTotal, openBalance } from "./customers.js";

/** Default subject/body for payment-link customer email. */
export function buildPaymentLinkEmail({ job, url, linkAmount, inv }) {
  const first = (job.customer || "").split(" ")[0] || "there";
  const total = invoiceTotal(job);
  const due = openBalance(job);
  const linkAmt = parseFloat(String(linkAmount).replace(/[$,]/g, "")) || due;
  const totalStr = total > 0 ? fmt$(total) : job.amount || "—";
  const dueStr = due > 0 ? fmt$(due) : totalStr;
  const linkStr = fmt$(linkAmt) || String(linkAmount);
  const work = (job.title || job.serviceType || "your electrical work").trim();

  const subject = `Payment link — Invoice #${inv} — LE Electric`;

  const body = [
    `Hi ${first},`,
    "",
    `Invoice #${inv} for ${work}.`,
    `Invoice total: ${totalStr}. Balance due: ${dueStr}.`,
    "",
    `Pay securely online (${linkStr} pre-filled on the link; you can change the amount on the payment page if needed):`,
    url,
    "",
    "Thank you,",
    "LE Electric",
    "leelectrical.us",
  ].join("\n");

  return { subject, body, first };
}