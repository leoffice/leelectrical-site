// Preview + subject/body for the pre-send confirmation sheet.
// Layout target: LEPRO_EMAIL_DESIGN_FIXES (amount banner + gray Bill-to HTML).
// Body text: greeting + ready to view/pay; never dump a raw pay URL.
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "./docSource.js";
import { activeTenantConfig, productName } from "./tenantBranding.js";
import { isChangeOrderJob } from "./changeOrder.js";

const s = (v) => (v == null ? "" : String(v).trim());

/**
 * Short trading name for email copy. Deliberately not tenantName(), which
 * returns the legal name ("… Inc.") that belongs on the PDF itself.
 */
const brand = () => activeTenantConfig().profile?.shortName || "";

/**
 * Greeting name for customer emails.
 * Companies keep the full name (e.g. "419 Kingston Realty");
 * people get first name (e.g. Mendel, not Mendel Cohen).
 */
export function docEmailGreetingName(job) {
  const company = s(job?.businessName);
  const customer = s(job?.customer);
  const person = s(job?.personName);
  // Prefer business/company name when present
  if (company) return company;
  const personOrCustomer = person || customer;
  if (personOrCustomer) {
    // First token only for people (Levi: "Hi Mendel,")
    const first = personOrCustomer.split(/\s+/)[0];
    return first || personOrCustomer;
  }
  return "there";
}

/** Work / scope line for "Your invoice #… for X is ready." */
export function docEmailWorkLabel(job) {
  const title = s(job?.title || job?.serviceType);
  if (isChangeOrderJob(job)) {
    if (title && /change\s*ord/i.test(title)) return title;
    return "Change order";
  }
  return title || "your electrical work";
}

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

/**
 * Default body for invoice/estimate customer email.
 * With pay: "Your invoice #N is ready to view and pay online."
 * No test-mode wording, no raw pay URL (View Invoice button + payment methods).
 */
export function defaultDocEmailBody(job, kind, { withPay = false, payUrl = "" } = {}) {
  // payUrl intentionally unused in the body — never print a long payment URL.
  void payUrl;
  const greet = docEmailGreetingName(job);
  const no = kind === "invoice" ? s(job?.invoiceNo) : s(job?.estimateNo);
  const label = kind === "estimate" ? "estimate" : "invoice";
  const num = no ? ` #${no}` : "";
  const lines = [`Hi ${greet},`, ""];
  if (kind === "invoice" && withPay) {
    lines.push(`Your invoice${num} is ready to view and pay online.`, "");
  } else {
    const work = docEmailWorkLabel(job);
    lines.push(`Your ${label}${num} for ${work} is ready.`, "");
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
