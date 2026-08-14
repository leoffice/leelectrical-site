// Preview + subject/body for the pre-send confirmation sheet.
// Layout target: LEPRO_EMAIL_DESIGN_FIXES (amount banner + gray Bill-to HTML).
// Body text: greeting + ready to view/pay; never dump a raw pay URL.
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "./docSource.js";
import { activeTenantConfig, productName } from "./tenantBranding.js";
import { isChangeOrderJob } from "./changeOrder.js";
import { normalizeEmail } from "./customers.js";

const s = (v) => (v == null ? "" : String(v).trim());

/** Split free-typed To field into unique addresses (comma/semicolon). */
export function parseSendRecipients(raw) {
  const seen = new Set();
  const out = [];
  for (const part of String(raw || "").split(/[,;]+/)) {
    const e = part.trim();
    if (!e || !e.includes("@")) continue;
    const key = normalizeEmail(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Canonical multi-email key for compare (sorted, lowercased). */
function emailListKey(raw) {
  return parseSendRecipients(raw)
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
    .sort()
    .join(",");
}

/**
 * True when the typed send-to address differs from the job/customer email.
 * Used to offer Keep this email vs Use it once before send.
 * Compares full multi-address lists (order-independent).
 */
export function sendEmailDiffersFromCustomer(typedEmail, jobEmail) {
  const a = emailListKey(typedEmail);
  const b = emailListKey(jobEmail);
  if (!a) return false;
  if (!b) return true;
  return a !== b;
}

/** keep = save on customer/job; once = send only, do not change customer. */
export const EMAIL_POLICY_KEEP = "keep";
export const EMAIL_POLICY_ONCE = "once";

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

/**
 * Short customer-facing scope for "Your estimate #… for X is ready."
 *
 * Prefer the estimate/invoice line description (what the customer already
 * sees on the PDF) over job.title. Titles often keep internal notes
 * (e.g. "ECB violations / work without permit") after the line text was
 * cleaned for the customer — Hackner est #201964 emailed the old title
 * even though the description no longer mentioned violations.
 */
export function docEmailWorkLabel(job, kind = "") {
  if (isChangeOrderJob(job)) {
    const title = s(job?.title || job?.serviceType);
    if (title && /change\s*ord/i.test(title)) return shortWorkLabel(title);
    return "Change order";
  }
  const fromLines = firstBillableLineLabel(job, kind);
  if (fromLines) return fromLines;
  const title = s(job?.title || job?.serviceType);
  if (title) return shortWorkLabel(title);
  return "your electrical work";
}

/** First non-empty description from billable lines (estimate or invoice). */
function firstBillableLineLabel(job, kind = "") {
  const k = String(kind || "").toLowerCase();
  const preferInvoice = k === "invoice";
  const pools = preferInvoice
    ? [job?.invoiceLines, job?.estimateLines]
    : [job?.estimateLines, job?.invoiceLines];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const ln of pool) {
      const raw = s(ln?.description || ln?.itemName);
      if (!raw) continue;
      const firstLine =
        raw
          .split(/\n/)
          .map((x) => x.trim())
          .find(Boolean) || raw;
      const label = shortWorkLabel(firstLine);
      if (label) return label;
    }
  }
  return "";
}

/** One short phrase — not a multi-line scope dump. */
function shortWorkLabel(text) {
  let t = s(text).replace(/\s+/g, " ");
  if (!t) return "";
  // Stop at sentence end when the first sentence is a usable phrase.
  const sentence = t.match(/^(.{12,120}?[.!?])(?:\s|$)/);
  if (sentence) t = sentence[1].replace(/[.!?]+$/, "").trim();
  if (t.length <= 90) return t;
  const cut = t.slice(0, 90);
  const sp = cut.lastIndexOf(" ");
  return ((sp > 40 ? cut.slice(0, sp) : cut).trim() + "…").replace(/\s+…$/, "…");
}

/** Default subject for invoice/estimate/statement customer email. */
export function defaultDocEmailSubject(job, kind, { withPay = false } = {}) {
  if (kind === "statement") {
    const model = job?._statementModel;
    const due = Number(model?.totalDue);
    const dueStr = Number.isFinite(due)
      ? due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "";
    const name = s(job?.businessName || job?.customer || model?.customerName);
    return dueStr
      ? `Statement from ${brand()} — $${dueStr} due${name ? " — " + name : ""}`
      : `Statement from ${brand()}${name ? " — " + name : ""}`;
  }
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
  if (kind === "statement") {
    const model = job?._statementModel;
    const due = Number(model?.totalDue);
    const dueStr = Number.isFinite(due)
      ? due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "0.00";
    const lines = [
      `Hi ${greet},`,
      "",
      `Your account statement is attached. Balance due: $${dueStr}.`,
      "",
      "The PDF is attached.",
      "",
      "Questions? Reply to this email or call us anytime.",
      "",
      "Thank you,",
      brand(),
      activeTenantConfig().profile?.website || "",
    ];
    return lines.join("\n");
  }
  const no = kind === "invoice" ? s(job?.invoiceNo) : s(job?.estimateNo);
  const label = kind === "estimate" ? "estimate" : "invoice";
  const num = no ? ` #${no}` : "";
  const lines = [`Hi ${greet},`, ""];
  if (kind === "invoice" && withPay) {
    lines.push(`Your invoice${num} is ready to view and pay online.`, "");
  } else {
    const work = docEmailWorkLabel(job, kind);
    // Only append "for …" when we have a real short label. Generic fallback
    // reads cleaner without it ("Your estimate #201964 is ready.").
    if (work && work !== "your electrical work") {
      lines.push(`Your ${label}${num} for ${work} is ready.`, "");
    } else {
      lines.push(`Your ${label}${num} is ready.`, "");
    }
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
  if (kind === "statement") {
    const model = job?._statementModel;
    const name = s(model?.customerName || job?.businessName || job?.customer)
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return name ? `Statement-${name}.pdf` : "Statement.pdf";
  }
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
  emailPolicy = "",
} = {}) {
  const to = s(email || job?.email);
  const src = docSource === DOC_SOURCE_QBO ? DOC_SOURCE_QBO : DOC_SOURCE_LOCAL;
  const subj = s(subject) || defaultDocEmailSubject(job, kind, { withPay });
  const body = s(message) || defaultDocEmailBody(job, kind, { withPay, payUrl });
  const differs = sendEmailDiffersFromCustomer(to, job?.email);
  const policy =
    emailPolicy === EMAIL_POLICY_KEEP || emailPolicy === EMAIL_POLICY_ONCE
      ? emailPolicy
      : differs
        ? ""
        : EMAIL_POLICY_ONCE;
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
    sourceLabel:
      src === DOC_SOURCE_QBO
        ? "QuickBooks file"
        : kind === "statement"
          ? `Local ${productName()} statement PDF`
          : `Local ${productName()} PDF`,
    emailDiffers: differs,
    emailPolicy: policy,
  };
}

/** True when confirm model has a usable recipient (and email policy if needed). */
export function canApproveSendConfirm(model) {
  if (!(model && s(model.email) && model.email.includes("@"))) return false;
  if (model.emailDiffers && model.emailPolicy !== EMAIL_POLICY_KEEP && model.emailPolicy !== EMAIL_POLICY_ONCE) {
    return false;
  }
  return true;
}

/** Brief beat after Approve & send before the sheet closes. */
export const SEND_CONFIRM_CLOSE_MS = 1000;

/** After a successful send: wait briefly then close (approve-and-send UX). */
export async function afterSendApprovedClose({ ok, onClose, delayMs = SEND_CONFIRM_CLOSE_MS }) {
  if (!ok) return false;
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
  onClose?.();
  return true;
}
