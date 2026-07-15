// Billing ↔ service address sync and display helpers.
import { addressesDiffer } from "./prefillFromEvent.js";

/** When billing is empty or still matched the prior service, copy service → billing. */
export function syncBillingFromService(nextService, { billingAddress, serviceAddress: prevService } = {}) {
  const svc = String(nextService || "").trim();
  const bill = String(billingAddress || "").trim();
  const prev = String(prevService || "").trim();
  if (!svc) return bill;
  if (!bill) return svc;
  if (prev && !addressesDiffer(bill, prev)) return svc;
  return bill;
}

/** Service addresses that differ from billing (for display). */
export function serviceAddressesExcludingBilling(serviceAddresses, billingAddress) {
  const bill = String(billingAddress || "").trim();
  if (!bill) return (serviceAddresses || []).filter(Boolean);
  return (serviceAddresses || []).filter((s) => {
    const v = String(s || "").trim();
    return v && addressesDiffer(v, bill);
  });
}