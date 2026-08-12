import { addressesDiffer } from "./prefillFromEvent.js";

// Bill-to vs service address for customer-facing invoice / pay PDF.
// Never put the service street alone under Bill To — for ANY doc (Levi
// 2026-08-10 Forty Hampton set the rule for permit renews; Levi 2026-08-11
// LE-2700 Chaim Saimon generalized it: the BILLING block is the customer's own
// billing address, the SERVICE block is the job site, kept independent. When
// no billing address is on file, Bill To shows the customer's contact
// (email / phone) — never a silent copy of the service street.

/** True when this doc is a city permit renew invoice. */
export function isPermitRenewDoc(job) {
  if (!job) return false;
  if (job.permitRenew || job.permitRenewMock) return true;
  if (job.renewCta || job.renewScenarioId) return true;
  return /permit\s+renew/i.test(String(job.title || ""));
}

/**
 * Customer-facing addresses are the FIRST paragraph only. A blank line inside
 * an address field separates the address from trailing notes — dictation
 * leftovers ("…11213\n\n\nWe are going to in", invoice 251854) printed at the
 * top of the customer pay page under BILLING (Levi 2026-08-12).
 */
export function firstAddressParagraph(raw) {
  return String(raw || "").trim().split(/\n\s*\n/)[0].trim();
}

/**
 * Bill-to block under the customer name (street / mail / email / phone).
 * Only a billing address the customer actually has prints here; a billing
 * field that is empty or just mirrors the job site (the old service→billing
 * auto-copy) falls back to contact instead of duplicating the service street.
 */
export function resolveBillToAddress(job = {}) {
  const j = job || {};
  const rawBill = firstAddressParagraph(j.billingAddress);
  // Probe against the EXPLICIT service address only. j.address is the generic
  // single-address field — on QBO-imported jobs it IS the billing address — so
  // it stays a legitimate billing fallback as long as it isn't the job site.
  const svcProbe = String(j.serviceAddress || "").trim();
  const notService = (v) => v && (!svcProbe || addressesDiffer(v, svcProbe));
  let billAddr = "";
  if (notService(rawBill)) billAddr = rawBill;
  else {
    const generic = firstAddressParagraph(j.address);
    if (notService(generic)) billAddr = generic;
  }
  if (!billAddr) {
    billAddr = [j.email, j.phone]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join("\n");
  }
  return billAddr;
}

/**
 * Build a renew bill-to string from known contact bits.
 * Prefer a real mailing street when it is not the service site.
 */
export function buildContactBillingAddress({
  billingAddress = "",
  mailAddress = "",
  email = "",
  phone = "",
  serviceAddress = "",
} = {}) {
  const svc = String(serviceAddress || "").trim().toLowerCase();
  const lines = [];
  for (const raw of [billingAddress, mailAddress]) {
    const street = String(raw || "").trim();
    if (!street) continue;
    if (svc && street.toLowerCase() === svc) continue;
    if (!lines.includes(street)) lines.push(street);
  }
  const em = String(email || "").trim();
  if (em && !lines.includes(em)) lines.push(em);
  const ph = String(phone || "").trim();
  if (ph && !lines.includes(ph)) lines.push(ph);
  return lines.join("\n");
}
