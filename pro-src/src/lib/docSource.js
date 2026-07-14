// Local vs QuickBooks document source — view and send paths stay explicit until QBO is retired.

export const DOC_SOURCE_LOCAL = "local";
export const DOC_SOURCE_QBO = "qbo";

export function docKindLabel(kind) {
  return kind === "invoice" ? "invoice" : "estimate";
}

export function viewLocalLabel(kind) {
  return kind === "invoice" ? "View Local Invoice" : "View Local Estimate";
}

export function viewQboLabel(kind) {
  return kind === "invoice" ? "View QuickBooks Invoice" : "View QuickBooks Estimate";
}

export function sendLocalLabel(kind, withPay) {
  const word = docKindLabel(kind);
  if (kind === "invoice" && withPay) return "Send Local Invoice with Payment Link";
  return "Send local " + word;
}

export function sendQboLabel(kind, withPay) {
  const word = docKindLabel(kind);
  if (kind === "invoice" && withPay) return "Send QuickBooks Invoice with Payment Link";
  return "Send QuickBooks " + word;
}

export function sourcePickerPrompt() {
  return "Local file or QuickBooks file?";
}