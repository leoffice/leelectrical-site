// Headers for the outbound-email endpoints (customer-email, send-doc-email).
// The server rejects anonymous POSTs (sendAuth.mjs); legit app sends carry the
// build-baked app key plus the signed-in user's bearer token when present.
import { authHeader } from "./session.js";

/** Build-baked app key — VITE_CUSTOMER_EMAIL_KEY (matches CUSTOMER_EMAIL_KEY server-side). */
export function emailKeyHeader() {
  let key = "";
  try {
    key = String(import.meta.env?.VITE_CUSTOMER_EMAIL_KEY || "").trim();
  } catch {
    key = "";
  }
  return key ? { "x-le-email-key": key } : {};
}

/** Full header set for an email-send fetch: extra + bearer (if signed in) + app key. */
export async function emailSendHeaders(extra) {
  let auth = {};
  try {
    auth = await authHeader();
  } catch {
    auth = {};
  }
  return { ...(extra || {}), ...auth, ...emailKeyHeader() };
}
