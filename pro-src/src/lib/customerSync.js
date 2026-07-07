// QuickBooks customer sync payload — billing/contact fields only.
// Service address is per job / invoice (ShipAddr on the invoice in QBO) and
// must NEVER be sent as the customer's BillAddr on customer_sync.

/** Canonical service location for a job (invoice/site address). */
export function effectiveServiceAddress(job) {
  const j = job || {};
  return j.serviceAddress || j.address || "";
}

/** Display name for UI headers (business name preferred). */
export function customerDisplayName(job) {
  const j = job || {};
  return j.businessName || j.customer || "";
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