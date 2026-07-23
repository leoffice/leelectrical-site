/** True unless EMAIL_TEST_MODE is explicitly "false". Default safe: test mode on. */
export function isEmailTestMode() {
  return String(process.env.EMAIL_TEST_MODE ?? "true").trim().toLowerCase() !== "false";
}

/** Single company mailbox for all outbound app mail (payment confirm, invoices, etc.). */
const DEFAULT_FROM = "office@leelectrical.us";

export function resolveFromAddress() {
  return (
    String(process.env.PAYMENT_CONFIRM_FROM || process.env.EMAIL_FROM || "").trim() ||
    DEFAULT_FROM
  );
}

/**
 * Split a free-typed "to" field into individual addresses.
 * Customers often store "a@x.com, b@y.com" — Resend requires an array, not one string.
 */
export function parseEmailRecipients(raw) {
  const seen = new Set();
  const out = [];
  for (const part of String(raw || "").split(/[,;]+/)) {
    const e = part.trim();
    if (!e || !e.includes("@")) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Single recipient (first address). Test mode → test inbox only. */
export function resolveRecipient(customerEmail) {
  const list = resolveRecipients(customerEmail);
  return list[0] || "";
}

/** All recipients for Resend `to: [...]`. Test mode → single test inbox. */
export function resolveRecipients(customerEmail) {
  if (isEmailTestMode()) {
    const test = String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim();
    return test ? [test] : [];
  }
  return parseEmailRecipients(customerEmail);
}