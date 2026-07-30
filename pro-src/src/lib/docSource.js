// Local vs QuickBooks document source — view and send paths stay explicit until QBO is retired.

export const DOC_SOURCE_LOCAL = "local";
export const DOC_SOURCE_QBO = "qbo";

export function docKindLabel(kind) {
  return kind === "invoice" ? "invoice" : "estimate";
}

/** Expand condensed line-item summary (description, qty, amount). */
export function viewExpandLabel(kind) {
  return kind === "invoice" ? "View Invoice" : "View Estimate";
}

/** Full layout / PDF-style preview (snappy HTML or PDF). */
export function viewDetailsLabel(_kind) {
  return "View Details";
}

/** @deprecated use viewDetailsLabel — kept for older call sites during rename */
export function viewLocalLabel(kind) {
  return viewDetailsLabel(kind);
}

/** Stored file / QuickBooks PDF. */
export function viewFileLabel(_kind) {
  return "View File";
}

export function viewQboLabel(kind) {
  return viewFileLabel(kind);
}

export function sendLocalLabel(kind, withPay) {
  const word = docKindLabel(kind);
  if (kind === "invoice" && withPay) return "Send with Payment Link";
  if (kind === "invoice") return "Send Invoice Only";
  return "Send " + word.charAt(0).toUpperCase() + word.slice(1);
}

export function sendQboLabel(kind, withPay) {
  return sendLocalLabel(kind, withPay);
}

/** Short action-bar labels for the horizontal doc row. */
export function sendPayLinkLabel() {
  return "Send with Payment Link";
}

export function sendDocOnlyLabel(kind) {
  return kind === "invoice" ? "Send Invoice Only" : "Send Estimate";
}

export function sourcePickerPrompt() {
  return "Local file or QuickBooks file?";
}