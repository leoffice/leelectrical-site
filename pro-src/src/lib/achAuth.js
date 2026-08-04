/**
 * ACH / bank-debit authorization language for staff Process and customer View & Pay.
 * Filled letter is shown before the customer/staff checks the box; server requires both.
 */

export function buildAchAuthLetter({
  companyName = "BLZ Electric Inc.",
  customerName = "",
  amountLabel = "",
  invoiceNo = "",
  accountLast4 = "",
  accountType = "checking",
  dateLabel = "",
} = {}) {
  const company = String(companyName || "BLZ Electric Inc.").trim() || "BLZ Electric Inc.";
  const who = String(customerName || "the account holder").trim() || "the account holder";
  const amt = String(amountLabel || "the amount shown").trim() || "the amount shown";
  const inv = String(invoiceNo || "").trim();
  const last4 = String(accountLast4 || "").replace(/\D/g, "").slice(-4);
  const acctType = /sav/i.test(String(accountType || "")) ? "savings" : "checking";
  const when = String(dateLabel || new Date().toLocaleDateString()).trim();

  const invBit = inv ? ` for invoice #${inv}` : "";
  const acctBit = last4 ? ` ending in ${last4}` : " identified below";

  return (
    `I, ${who}, authorize ${company} to initiate a one-time electronic debit (ACH) ` +
    `from my ${acctType} account${acctBit} in the amount of ${amt}${invBit}. ` +
    `This is not a card charge. Authorization date: ${when}. ` +
    `I confirm the routing and account numbers are correct. ` +
    `I understand I may contact the office to dispute an unauthorized debit.`
  );
}

/**
 * Client-side gate before Process / Pay by ACH.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateAchAuthorization({ authorized, letterText } = {}) {
  const ok =
    authorized === true ||
    authorized === 1 ||
    authorized === "1" ||
    String(authorized || "").toLowerCase() === "true";
  if (!ok) {
    return {
      ok: false,
      error: "Check the authorization box to confirm the routing and account numbers are correct",
    };
  }
  if (!String(letterText || "").trim()) {
    return { ok: false, error: "Authorization language is required before processing" };
  }
  return { ok: true };
}
