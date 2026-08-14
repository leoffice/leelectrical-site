// Partial-service (Con Ed temporary-bridge) invoice emails must carry the
// refund-instructions block — in the EMAIL BODY only, never on the PDF.
//
// The client seeds the block into the compose message (lib/partialService.js
// in pro-src); this server-side twin is the safety net for resends and edited
// messages, so a partial-service invoice can never go out without it.
// Keep the block text in lockstep with pro-src/src/lib/partialService.js.

const PARTIAL_RE = /partial\s*service/i;
const BRIDGE_RE = /temporary\s+bridge/i;

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

export const CONED_REFUND_MARKER = "Claims Administration";

function hasPartialServiceLines(lines) {
  return (Array.isArray(lines) ? lines : []).some(
    (ln) =>
      ln &&
      (ln.partialService === true ||
        PARTIAL_RE.test(String(ln.itemName || "")) ||
        BRIDGE_RE.test(String(ln.description || "")))
  );
}

/** True when this invoice job is a partial-service (temporary bridge) job. */
export function jobHasPartialService(job) {
  if (!job || typeof job !== "object") return false;
  return hasPartialServiceLines(job.invoiceLines) || hasPartialServiceLines(job.items);
}

/** Ensure the customer message carries the refund block (idempotent, top). */
export function withConedRefundInstructions(body) {
  const text = String(body || "");
  if (text.includes(CONED_REFUND_MARKER)) return text;
  if (!text.trim()) return CONED_REFUND_INSTRUCTIONS;
  const parts = text.split("\n\n");
  if (parts.length >= 2) {
    parts.splice(2, 0, CONED_REFUND_INSTRUCTIONS);
    return parts.join("\n\n");
  }
  return CONED_REFUND_INSTRUCTIONS + "\n\n" + text;
}
