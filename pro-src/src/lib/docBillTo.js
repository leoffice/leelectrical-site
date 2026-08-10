// Bill-to vs service address for customer-facing invoice / pay PDF.
// Permit renew: full contact (mail + email + phone) under Bill To; site under Service Address.
// Never put the service street alone under Bill To (Levi 2026-08-10 — Forty Hampton).

/** True when this doc is a city permit renew invoice. */
export function isPermitRenewDoc(job) {
  if (!job) return false;
  if (job.permitRenew || job.permitRenewMock) return true;
  if (job.renewCta || job.renewScenarioId) return true;
  return /permit\s+renew/i.test(String(job.title || ""));
}

/**
 * Bill-to block under the customer name (street / mail / email / phone).
 * Renew: never fall back to the service site street.
 */
export function resolveBillToAddress(job = {}) {
  const j = job || {};
  const forceService = isPermitRenewDoc(j);
  const rawBill = String(j.billingAddress || "").trim();
  const svcProbe = String(j.serviceAddress || j.address || "").trim();
  let billAddr = forceService
    ? rawBill && rawBill.toLowerCase() !== svcProbe.toLowerCase()
      ? rawBill
      : ""
    : (rawBill || j.address || "").trim();
  if (forceService && !billAddr) {
    const contact = [j.email, j.phone]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    billAddr = contact.join("\n");
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
