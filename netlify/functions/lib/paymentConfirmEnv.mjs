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

export function resolveRecipient(customerEmail) {
  const cust = String(customerEmail || "").trim();
  if (isEmailTestMode()) {
    return String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim();
  }
  return cust;
}