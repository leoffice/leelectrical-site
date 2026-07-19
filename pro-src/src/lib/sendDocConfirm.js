// Preview + subject/body for the pre-send confirmation sheet.
import { fmt$ } from "./format.js";
import { openBalance, invoiceTotal } from "./customers.js";
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "./docSource.js";
import { activeTenantConfig, productName } from "./tenantBranding.js";

const s = (v) => (v == null ? "" : String(v).trim());

/**
 * Short trading name for email copy. Deliberately not tenantName(), which
 * returns the legal name ("… Inc.") that belongs on the PDF itself.
 */
const brand = () => activeTenantConfig().profile?.shortName || "";

/** Default subject for invoice/estimate customer email. */
export function defaultDocEmailSubject(job, kind, { withPay = false } = {}) {
  const no = kind === "invoice" ? s(job?.invoiceNo) : s(job?.estimateNo);
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const num = no ? ` #${no}` : "";
  if (kind === "invoice" && withPay) {
    return `${label}${num} — pay online — ${brand()}`;
  }
  return `${label}${num} — ${brand()}`;
}

/** Default body for invoice/estimate customer email. */
export function defaultDocEmailBody(job, kind, { withPay = false, payUrl = "" } = {}) {
  const first = s(job?.customer).split(" ")[0] || "there";
  const no = kind === "invoice" ? s(job?.invoiceNo) : s(job?.estimateNo);
  const work = s(job?.title || job?.serviceType || "your electrical work") || "your electrical work";
  const label = kind === "estimate" ? "estimate" : "invoice";
  const lines = [
    `Hi ${first},`,
    "",
    `Your ${label}${no ? " #" + no : ""} for ${work} is ready.`,
    "",
  ];
  if (kind === "invoice") {
    const total = invoiceTotal(job);
    const due = openBalance(job);
    if (total > 0) lines.push(`Invoice total: ${fmt$(total)}`);
    if (due > 0.01) lines.push(`Balance due: ${fmt$(due)}`);
    if (total > 0 || due > 0.01) lines.push("");
  }
  if (withPay && payUrl) {
    lines.push("Pay securely online:", payUrl, "");
  } else if (withPay) {
    lines.push("A secure payment link is included with this email.", "");
  }
  lines.push(
    "The PDF is attached.",
    "",
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    brand(),
    activeTenantConfig().profile?.website || ""
  );
  return lines.join("\n");
}

/** Attachment filename shown on the confirm sheet. */
export function docAttachmentName(job, kind) {
  const no = kind === "invoice" ? s(job?.invoiceNo) : s(job?.estimateNo);
  const base = kind === "estimate" ? "Estimate" : "Invoice";
  return no ? `${base}-${no}.pdf` : `${base}.pdf`;
}

/** Build the confirm-sheet model before any document is emailed. */
export function buildSendDocConfirm({
  job,
  kind = "invoice",
  docSource = DOC_SOURCE_LOCAL,
  withPay = false,
  email,
  subject,
  message,
  payUrl = "",
} = {}) {
  const to = s(email || job?.email);
  const src = docSource === DOC_SOURCE_QBO ? DOC_SOURCE_QBO : DOC_SOURCE_LOCAL;
  const subj = s(subject) || defaultDocEmailSubject(job, kind, { withPay });
  const body = s(message) || defaultDocEmailBody(job, kind, { withPay, payUrl });
  return {
    job,
    kind,
    docSource: src,
    withPay: !!(withPay && kind === "invoice"),
    email: to,
    subject: subj,
    message: body,
    attachmentName: docAttachmentName(job, kind),
    payUrl: s(payUrl),
    sourceLabel: src === DOC_SOURCE_QBO ? "QuickBooks file" : `Local ${productName()} PDF`,
  };
}

/** True when confirm model has a usable recipient. */
export function canApproveSendConfirm(model) {
  return !!(model && s(model.email) && model.email.includes("@"));
}
