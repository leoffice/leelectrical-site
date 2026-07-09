// Add-customer flow helpers — snapshot, diff detection, QBO name conflict,
// and save-action resolution (link existing / update / create).
import { normalizeCustomer } from "./customers.js";

export const ADD_CUSTOMER_FIELDS = [
  "businessName",
  "personName",
  "phone",
  "email",
  "billingAddress",
  "serviceAddress",
  "apartment",
];

/** Normalize form values for stable comparison after a QBO pick. */
export function snapshotCustomerForm(form) {
  const f = form || {};
  const out = {};
  for (const k of ADD_CUSTOMER_FIELDS) out[k] = String(f[k] || "").trim();
  return out;
}

export function customerFormDiffersFromBaseline(form, baseline) {
  if (!baseline) return false;
  const cur = snapshotCustomerForm(form);
  return ADD_CUSTOMER_FIELDS.some((k) => cur[k] !== baseline[k]);
}

/** True when normalized business name matches any QBO index row. */
export function businessNameTakenInQbo(businessName, qboCustomers) {
  const key = normalizeCustomer(businessName);
  if (!key) return false;
  for (const c of qboCustomers || []) {
    const names = [c.businessName, c.name, c.personName].map(normalizeCustomer).filter(Boolean);
    if (names.includes(key)) return true;
  }
  return false;
}

/** Whether "Create new customer" should be disabled after edits. */
export function createNewCustomerDisabled(businessName, qboCustomers) {
  return businessNameTakenInQbo(businessName, qboCustomers);
}

/**
 * Resolve QuickBooks action on Save & Sync.
 * @returns {"link"|"update"|"create"}
 */
export function resolveAddCustomerAction({ baseline, matchedQboId, formChanged, syncAction }) {
  if (!baseline || !matchedQboId) return "create";
  if (!formChanged) return "link";
  return syncAction === "create" ? "create" : "update";
}