// "Partial Service" invoice preset — the Con Ed power-outage / temporary-bridge
// two-visit job (Levi 2026-08-14).
//
// Picking the "Partial Service" catalog item in the invoice builder opens a
// questionnaire (date it happened, Con Ed ticket #, approve the initial visit
// hours) and generates BOTH line items: the emergency visit and the follow-up.
// The ticket number embeds in the line description — precedent invoice #251839
// ("Service request of coned Ticket Number …" at $210.00/unit).
//
// The customer email for a partial-service invoice must carry the Con Ed
// refund instructions block — in the EMAIL BODY only, never on the PDF.

const PARTIAL_RE = /partial\s*service/i;
const BRIDGE_RE = /temporary\s+bridge/i;

/** Catalog/line item name that triggers the partial-service questionnaire. */
export function isPartialServiceProduct(name) {
  return PARTIAL_RE.test(String(name || ""));
}

/** Levi: "approve the initial visit, which is an hour and a half." */
export const PARTIAL_SERVICE_INITIAL_HOURS = 1.5;

/**
 * Hourly rate defaults — CONFIRMED by Levi 2026-08-14, and they differ per
 * visit: emergency $265/hr, follow-up $225/hr. (His original voice note said
 * "$2.25" — dictation slip; the old #251839 precedent was $210 flat.) Both
 * rates stay EDITABLE in the questionnaire — never silently billed.
 */
export const PARTIAL_SERVICE_INITIAL_RATE = 265;
export const PARTIAL_SERVICE_FOLLOWUP_RATE = 225;

export const PARTIAL_ROLE_INITIAL = "initial";
export const PARTIAL_ROLE_FOLLOWUP = "followup";

/** "2026-08-14" → "8/14/2026" for line descriptions; passthrough otherwise. */
export function formatPartialServiceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return String(iso || "").trim();
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

/** Line 1 — the emergency visit (Levi's wording, ticket # embedded). */
export function partialServiceInitialDescription({ serviceDate = "", ticketNo = "" } = {}) {
  const date = formatPartialServiceDate(serviceDate);
  const ticket = String(ticketNo || "").trim();
  return [
    "Emergency service for power outage" +
      (date ? " on " + date : "") +
      " and performing inspection on the equipment to verify power outage from the utility company (Con Edison).",
    "Installing a temporary bridge for the service to restore partial service to the building.",
    "Generating an emergency ticket with Con Ed" + (ticket ? ` — Ticket # ${ticket}` : "") + ".",
  ].join("\n");
}

/** Line 2 — the follow-up visit (Levi's wording). */
export function partialServiceFollowUpDescription() {
  return [
    "Follow-up visit: verifying power restoration to the building.",
    "Removal of temporary bridge wiring.",
    "Restoring service to safe conditions.",
  ].join("\n");
}

/**
 * Build BOTH partial-service line items from the questionnaire answers.
 * Returned objects are plain line patches — the builder merges them onto its
 * rows (keeping _rowId). The role keys make re-editing idempotent.
 */
export function buildPartialServiceLines({
  serviceDate = "",
  ticketNo = "",
  initialHours = PARTIAL_SERVICE_INITIAL_HOURS,
  rate = PARTIAL_SERVICE_INITIAL_RATE,
  followUpRate = PARTIAL_SERVICE_FOLLOWUP_RATE,
} = {}) {
  const hours = Number(initialHours) > 0 ? Number(initialHours) : PARTIAL_SERVICE_INITIAL_HOURS;
  const initialPrice = Number(rate) > 0 ? Number(rate) : PARTIAL_SERVICE_INITIAL_RATE;
  const followPrice = Number(followUpRate) > 0 ? Number(followUpRate) : PARTIAL_SERVICE_FOLLOWUP_RATE;
  return [
    {
      itemName: "Partial Service",
      description: partialServiceInitialDescription({ serviceDate, ticketNo }),
      qty: hours,
      unitPrice: initialPrice,
      partialService: true,
      partialServiceRole: PARTIAL_ROLE_INITIAL,
      partialServiceDate: String(serviceDate || ""),
      conedTicketNo: String(ticketNo || "").trim(),
    },
    {
      itemName: "Partial Service",
      description: partialServiceFollowUpDescription(),
      qty: 1,
      unitPrice: followPrice,
      partialService: true,
      partialServiceRole: PARTIAL_ROLE_FOLLOWUP,
    },
  ];
}

/** True when any line is (or reads like) a partial-service visit. */
export function hasPartialServiceLines(lines) {
  return (Array.isArray(lines) ? lines : []).some(
    (ln) =>
      ln &&
      (ln.partialService === true ||
        PARTIAL_RE.test(String(ln.itemName || "")) ||
        BRIDGE_RE.test(String(ln.description || "")))
  );
}

/** True when this job's invoice is a partial-service invoice. */
export function jobHasPartialService(job) {
  if (!job || typeof job !== "object") return false;
  return hasPartialServiceLines(job.invoiceLines) || hasPartialServiceLines(job.items);
}

/**
 * The Con Ed refund block — VERBATIM from prior sent partial-service invoices
 * (#251839, #251797). Email body only; never printed on the invoice PDF.
 */
export const CONED_REFUND_INSTRUCTIONS = [
  "Instruction on how to get a refund from ConEd:",
  "",
  "Send the invoice to:",
  "30 Flatbush Ave 11217",
  "Claims Administration",
  "",
  "Or fax to: 718-643-6943",
  "",
  "Please include the following information with your request:",
  "• Account number",
  "• Address and phone number",
  "• This invoice",
  "• A request for a refund",
].join("\n");

/** Cheap presence probe so the block is never inserted twice. */
export const CONED_REFUND_MARKER = "Claims Administration";

/**
 * Ensure a customer-email body carries the refund block, prominently near the
 * top: right after the greeting + intro paragraph when the body has that
 * shape, else prepended. Idempotent.
 */
export function withConedRefundInstructions(body) {
  const text = String(body || "");
  if (text.includes(CONED_REFUND_MARKER)) return text;
  if (!text.trim()) return CONED_REFUND_INSTRUCTIONS;
  const parts = text.split("\n\n");
  // parts[0] = "Hi X,", parts[1] = "Your invoice #N … is ready." — block goes third.
  if (parts.length >= 2) {
    parts.splice(2, 0, CONED_REFUND_INSTRUCTIONS);
    return parts.join("\n\n");
  }
  return CONED_REFUND_INSTRUCTIONS + "\n\n" + text;
}
