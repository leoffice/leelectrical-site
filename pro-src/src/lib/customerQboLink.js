// Apply QuickBooks customer id back onto jobs after create/update commands finish.

/** Parse create_customer / update_customer command result. */
export function parseCustomerQboResult(result) {
  let res = result;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch {
      return null;
    }
  }
  if (!res || typeof res !== "object") return null;
  const id = String(res.customerId || res.id || "").trim();
  if (!id) return null;
  return { customerId: id, name: String(res.name || "").trim() };
}

/** Job overlay patch when a customer command succeeded. */
export function customerQboJobPatch(result) {
  const parsed = parseCustomerQboResult(result);
  if (!parsed) return null;
  return { qboCustomerId: parsed.customerId };
}