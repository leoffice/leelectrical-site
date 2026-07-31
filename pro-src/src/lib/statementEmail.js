// Client helpers for statement email draft (subject/body) — mirrors sendDocConfirm.
import { activeTenantConfig, productName } from "./tenantBranding.js";
import { docEmailGreetingName } from "./sendDocConfirm.js";
import { statementFilename } from "./statementDoc.js";

const s = (v) => (v == null ? "" : String(v).trim());
const brand = () => activeTenantConfig().profile?.shortName || productName() || "LE Electrical";

export function defaultStatementEmailSubject(model) {
  const name = s(model?.customerName) || "customer";
  const due = Number(model?.totalDue) || 0;
  const dueStr = due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Statement from ${brand()} — $${dueStr} due — ${name}`;
}

export function defaultStatementEmailBody(model) {
  // Build a job-shaped object for greeting when possible
  const greet = docEmailGreetingName({
    businessName: model?.customerName,
    customer: model?.customerName,
    email: model?.customerEmail,
  });
  const due = Number(model?.totalDue) || 0;
  const dueStr = due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = [
    `Hi ${greet},`,
    "",
    `Your account statement is attached. Balance due: $${dueStr}.`,
    "",
  ];
  if (model?.payRows?.length) {
    lines.push("You can pay individual open invoices online using the links in the statement PDF.", "");
  }
  lines.push(
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    brand(),
    activeTenantConfig().profile?.website || ""
  );
  return lines.join("\n");
}

/** Payload for send-doc-email kind:"statement". */
export function buildStatementEmailPayload(model, { email, subject, message, pdfB64 } = {}) {
  const company = activeTenantConfig().profile || {};
  return {
    kind: "statement",
    email: s(email || model?.customerEmail),
    subject: s(subject) || defaultStatementEmailSubject(model),
    message: s(message) || defaultStatementEmailBody(model),
    filename: statementFilename(model),
    pdfB64: s(pdfB64),
    statement: {
      email: s(email || model?.customerEmail),
      subject: s(subject) || defaultStatementEmailSubject(model),
      totalDue: model?.totalDue || 0,
      customerName: model?.customerName || "",
      type: model?.type || "open_items",
      typeLabel: model?.typeLabel || "",
      asOf: model?.asOf || "",
      payRows: model?.payRows || [],
      company: {
        name: company.companyName || company.shortName || brand(),
        email: company.email || "",
        phone: company.phone || "",
      },
    },
  };
}
