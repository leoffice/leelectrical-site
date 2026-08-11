// Billing / service address display helpers.
//
// There used to be a syncBillingFromService() here that copied the service
// address into an empty billing field. Removed (Levi 2026-08-11, LE-2700 —
// Chaim Saimon's invoice printed the job site under BILLING ADDRESS): the
// billing address is the customer's own and is never derived from the job
// site. See docBillTo.resolveBillToAddress for the render-side rule.
import { addressesDiffer } from "./prefillFromEvent.js";

/** Service addresses that differ from billing (for display). */
export function serviceAddressesExcludingBilling(serviceAddresses, billingAddress) {
  const bill = String(billingAddress || "").trim();
  if (!bill) return (serviceAddresses || []).filter(Boolean);
  return (serviceAddresses || []).filter((s) => {
    const v = String(s || "").trim();
    return v && addressesDiffer(v, bill);
  });
}