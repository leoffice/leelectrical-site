import { fmt$ } from "./format.js";
import { invoiceTotal, openBalance } from "./customers.js";
import { fmtMoneyPrecise, totalWithFee } from "./payFees.js";
import { activeTenantConfig } from "./tenantBranding.js";

/** Default subject/body for payment-link customer email — short link, friendly layout. */
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

  // Short trading name, not tenantName()/tenantSignOff() — those carry the
  // legal "Inc." that belongs on documents, not in customer email copy.
  const profile = activeTenantConfig().profile || {};
  const brand = profile.shortName || "";

  const subject = `Invoice #${inv} — pay online — ${brand}`;

  const body = [
    `Hi ${first},`,
    "",
    `Your invoice #${inv} for ${work} is ready.`,
    "",
    `Invoice total: ${totalStr}`,
    `Balance due: ${dueStr}`,
    "",
    "Pay securely online:",
    url,
    "",
    `Suggested payment: ${linkStr} (+ 3.5% processing fee → ${chargeStr} total).`,
    "You can adjust the amount on the pay page before completing.",
    "",
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    brand,
    profile.website || "",
  ].join("\n");

  return { subject, body, first, payButtonLabel: "Pay invoice #" + inv };
}