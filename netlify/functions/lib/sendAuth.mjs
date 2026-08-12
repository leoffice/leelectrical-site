// Auth gate for outbound-email endpoints (customer-email, send-doc-email).
//
// These endpoints send branded mail from the company address via Resend, so an
// unauthenticated POST is a spoofing/spam vector (anyone with the URL could
// mail arbitrary recipients as office@). Two ways in:
//
//   1. App key — `x-le-email-key` header matching CUSTOMER_EMAIL_KEY (set as a
//      CF Pages secret). The LE Pro client bakes the same value at build time
//      (VITE_CUSTOMER_EMAIL_KEY), covering tokenless legacy clients.
//   2. Signed-in tenant — a Supabase `Authorization: Bearer` token that
//      resolves to a tenant (resolveTenant fails closed on bad tokens).
//
// Fail-closed: if CUSTOMER_EMAIL_KEY is unset on the server, key auth is
// unavailable (503 so misconfiguration is visible, not silently open).
import { resolveTenant } from "./tenant.mjs";

function headerVal(req, name) {
  try {
    return String(req?.headers?.get?.(name) || "").trim();
  } catch {
    return "";
  }
}

/** Constant-time-ish string compare (edge runtime, no node:crypto guarantee). */
function safeEq(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/**
 * @returns {Promise<{ok:true, via:"key"|"token", tenant?:string} |
 *                   {ok:false, status:number, error:string}>}
 */
export async function authorizeSend(req) {
  const configured = String(process.env.CUSTOMER_EMAIL_KEY || "").trim();
  const key = headerVal(req, "x-le-email-key");
  if (configured && key && safeEq(key, configured)) {
    return { ok: true, via: "key" };
  }

  // Signed-in tenant user. Only consult resolveTenant when a Bearer token is
  // actually present — tokenless requests fall back to the default tenant
  // there, which must NOT count as authentication here.
  const authz = headerVal(req, "authorization");
  if (/^Bearer\s+\S+/i.test(authz)) {
    const tenant = await resolveTenant(req);
    if (tenant != null) return { ok: true, via: "token", tenant };
  }

  if (!configured) {
    return { ok: false, status: 503, error: "send auth not configured" };
  }
  return { ok: false, status: 401, error: "unauthenticated" };
}
