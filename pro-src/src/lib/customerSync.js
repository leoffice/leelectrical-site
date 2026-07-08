// QuickBooks customer sync payload — billing/contact fields only.
// Service address is per invoice/estimate (ShipAddr on that document in QBO) and
// must NEVER be sent as the customer's BillAddr on customer_sync.

/** Canonical service location for a job (ShipAddr on its invoice/estimate). */
export function effectiveServiceAddress(job) {
  const j = job || {};
  return j.serviceAddress || j.address || "";
}

/** UI label — service address is tied to the invoice or estimate number. */
export function serviceAddressLabel(job, fallback = "Service address") {
  const j = job || {};
  if (j.invoiceNo) return `Service address (invoice #${j.invoiceNo})`;
  if (j.estimateNo) return `Service address (estimate #${j.estimateNo})`;
  return fallback;
}

/** Short hint for service-address fields in forms. */
export function serviceAddressHint(job) {
  const j = job || {};
  if (j.invoiceNo || j.estimateNo) {
    return "Where we performed work for this invoice/estimate (QuickBooks ShipAddr).";
  }
  return "Where this job is being done — goes on the invoice or estimate when created.";
}

/** Display name for UI headers (business name preferred). */
export function customerDisplayName(job) {
  const j = job || {};
  return j.businessName || j.customer || "";
}

/** True when name, phone, email, and billing address are all on file (QBO-complete profile). */
export function customerProfileComplete(contact) {
  const c = contact || {};
  const name = String(c.businessName || c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const email = String(c.email || "").trim();
  const billing = String(c.billingAddress || "").trim();
  return !!(name && phone && email && billing);
}

/** Jobs list card tint — green when profile is complete, light orange when partial. */
export function customerSyncCardClass(contact) {
  const c = contact || {};
  const name = String(c.businessName || c.name || "").trim();
  if (!name) return "";
  return customerProfileComplete(c)
    ? "bg-emerald-50/95 border-emerald-300/90"
    : "bg-orange-50/95 border-orange-200/90";
}

/** Payload for customer_sync / create_customer / update_customer commands. */
export function customerSyncPayload(job) {
  const j = job || {};
  const billing = j.billingAddress || j.billingAddr || "";
  const name = j.businessName || j.customer || j.name || "";
  return {
    name,
    businessName: j.businessName || j.customer || j.name || "",
    personName: j.personName || "",
    email: j.email || "",
    phone: j.phone || "",
    billingAddr: billing,
    // Legacy key — host listener maps this to QuickBooks BillAddr, not ShipAddr.
    addr: billing,
  };
}