/**
 * WP7 — Assistant activation endpoint (the license → assistant-ON wiring).
 *
 * A tenant OWNER submits a license key. We verify their Supabase session, bind
 * the key to their tenant (per-tenant scoping), and — with the SERVICE ROLE —
 * flip tenant_config.module_overrides.assistant = true. That last write is what
 * migration 003 forbids a client from doing, so it MUST happen here, only after
 * a real key validates. Raw keys are never stored; we match on sha256(hash).
 *
 * POST (Authorization: Bearer <user access_token>)  { key }
 *   -> { ok:true, entitled:true, tenantId }
 *
 * Env read at call time (CF Pages pagesAdapter populates process.env first).
 * NOTE: preview/branch only until shipped via the bus deploy lane.
 */
import { sha256Hex, normalizeToken } from "./lib/assistantLicense.mjs";

const SB_URL = () => process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const SVC_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = () => process.env.SUPABASE_ANON_KEY || "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: corsHeaders() });

const svc = (path, init = {}) =>
  fetch(`${SB_URL()}${path}`, {
    ...init,
    headers: {
      apikey: SVC_KEY(),
      Authorization: `Bearer ${SVC_KEY()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

async function resolveUser(userToken) {
  const r = await fetch(`${SB_URL()}/auth/v1/user`, {
    headers: { apikey: ANON(), Authorization: `Bearer ${userToken}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => ({}));
  return u && u.id ? { id: u.id } : null;
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SVC_KEY()) return json({ ok: false, error: "server not configured" }, 500);

  // Auth: valid Supabase session, resolving to a tenant OWNER.
  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!userToken) return json({ ok: false, error: "missing session" }, 401);
  const user = await resolveUser(userToken);
  if (!user) return json({ ok: false, error: "invalid session" }, 401);

  const prof = await (await svc(`/rest/v1/profiles?id=eq.${user.id}&select=tenant_id,role`)).json();
  const tenantId = prof?.[0]?.tenant_id;
  const role = prof?.[0]?.role;
  if (!tenantId) return json({ ok: false, error: "no tenant for this account" }, 403);
  if (role !== "owner") return json({ ok: false, error: "only the owner can activate the assistant" }, 403);

  let body = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const key = normalizeToken(body.key || body.token || body.code);
  if (key.length < 12) return json({ ok: false, error: "enter a valid license key" }, 400);
  const keyHash = sha256Hex(key);

  // Look up the license by hash.
  const rows = await (await svc(`/rest/v1/assistant_licenses?key_hash=eq.${keyHash}&select=*`)).json();
  const lic = Array.isArray(rows) ? rows[0] : null;
  if (!lic) return json({ ok: false, error: "invalid license key" }, 400);
  if (lic.status === "revoked") return json({ ok: false, error: "this license has been revoked" }, 400);

  const now = new Date().toISOString();
  try {
    if (lic.status === "issued" && !lic.tenant_id) {
      // bind the unbound seat to this tenant
      const r = await svc(`/rest/v1/assistant_licenses?id=eq.${lic.id}&status=eq.issued`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ tenant_id: tenantId, status: "active", activated_at: now, last_used_at: now }),
      });
      const upd = await r.json().catch(() => []);
      if (!r.ok || !upd[0]) return json({ ok: false, error: "activation raced — try again" }, 409);
    } else if (lic.status === "active" && lic.tenant_id === tenantId) {
      // idempotent re-activation
      await svc(`/rest/v1/assistant_licenses?id=eq.${lic.id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_used_at: now }),
      });
    } else {
      // active/bound to a different tenant
      return json({ ok: false, error: "this license is already in use on another account" }, 409);
    }

    // Flip the gate ON — SERVICE ROLE (003 forbids the client from doing this).
    const cfg = await (await svc(`/rest/v1/tenant_config?tenant_id=eq.${tenantId}&select=module_overrides`)).json();
    const overrides = { ...((cfg?.[0]?.module_overrides) || {}), assistant: true };
    const cr = await svc(`/rest/v1/tenant_config?tenant_id=eq.${tenantId}`, {
      method: "PATCH",
      body: JSON.stringify({ module_overrides: overrides }),
    });
    if (!cr.ok) throw new Error(`enable module failed: HTTP ${cr.status}`);

    return json({ ok: true, entitled: true, tenantId });
  } catch (e) {
    return json({ ok: false, error: `activation failed: ${e.message}` }, 502);
  }
};
