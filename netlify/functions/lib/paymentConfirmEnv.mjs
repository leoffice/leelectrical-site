/** True unless EMAIL_TEST_MODE is explicitly "false". Default safe: test mode on. */
export function isEmailTestMode() {
  return String(process.env.EMAIL_TEST_MODE ?? "true").trim().toLowerCase() !== "false";
}

export function resolveFromAddress() {
  return (
    String(process.env.PAYMENT_CONFIRM_FROM || "").trim() ||
    "payments@leelectrical.us"
  );
}

export function resolveRecipient(customerEmail) {
  const cust = String(customerEmail || "").trim();
  if (isEmailTestMode()) {
    return String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim();
  }
  return cust;
}