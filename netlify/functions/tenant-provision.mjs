/**
 * Post-OAuth tenant bootstrap — for signups where the auth user already exists.
 *
 * Google (and any Supabase OAuth) creates the auth.users row itself, with the
 * email pre-verified — so there's NO email-verification step and NO password.
 * But the app-specific rows (tenant + tenant_config + profile) still have to be
 * created, and Google doesn't give us a company name — the client collects it
 * and sends it here after the OAuth redirect returns with a session.
 *
 * Gate: the caller MUST present a valid Supabase user access token (proves they
 * authenticated via the provider). We verify it against /auth/v1/user, then use
 * the SERVICE ROLE for the writes. Idempotent: a user who already has a profile
 * gets {ok, already:true} — one tenant per account, no re-provision.
 *
 * POST  (Authorization: Bearer <user access_token>)  { companyName, planTier? }
 *   -> { ok:true, tenantId, already? }
 *
 * Fail-closed behind SIGNUP_ENABLED, same as tenant-signup.mjs. Env read at call
 * time (CF Pages pagesAdapter populates process.env before the handler runs).
 */

const SB_URL = () => process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const SVC_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = () => process.env.SUPABASE_ANON_KEY || "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";
const signupEnabled = () =>
  process.env.SIGNUP_ENABLED === "1" || process.env.SIGNUP_ENABLED === "true";

const SELF_SERVE_TIERS = new Set(["free", "pro"]);

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders() });

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

// Verify the caller's user token → { id, email } | null
async function resolveUser(userToken) {
  const r = await fetch(`${SB_URL()}/auth/v1/user`, {
    headers: { apikey: ANON(), Authorization: `Bearer ${userToken}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => ({}));
  return u && u.id ? { id: u.id, email: u.email || "" } : null;
}

function baseSlug(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return s || "tenant";
}
function randSuffix() {
  return Math.random().toString(36).slice(2, 6);
}
async function slugTaken(id) {
  const r = await svc(`/rest/v1/tenants?id=eq.${encodeURIComponent(id)}&select=id`);
  if (!r.ok) throw new Error(`slug check failed: HTTP ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
async function uniqueSlug(name) {
  const base = baseSlug(name);
  if (!(await slugTaken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const cand = `${base}-${randSuffix()}`.slice(0, 40);
    if (!(await slugTaken(cand))) return cand;
  }
  throw new Error("could not allocate a unique tenant slug");
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SVC_KEY()) return json({ ok: false, error: "server not configured" }, 500);
  if (!signupEnabled()) return json({ ok: false, error: "signups are not open" }, 403);

  // Auth gate: a valid provider session is required.
  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!userToken) return json({ ok: false, error: "missing session" }, 401);
  const user = await resolveUser(userToken);
  if (!user) return json({ ok: false, error: "invalid session" }, 401);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const companyName = String(body.companyName || "").trim();
  const planTier = SELF_SERVE_TIERS.has(body.planTier) ? body.planTier : "free";
  if (companyName.length < 2) return json({ ok: false, error: "company name required" }, 400);

  // Idempotent: already provisioned → return the existing tenant.
  try {
    const prof = await (await svc(`/rest/v1/profiles?id=eq.${user.id}&select=tenant_id`)).json();
    if (Array.isArray(prof) && prof[0] && prof[0].tenant_id) {
      return json({ ok: true, tenantId: prof[0].tenant_id, already: true });
    }
  } catch (e) {
    return json({ ok: false, error: `lookup failed: ${e.message}` }, 502);
  }

  let tenantId = null;
  const rollback = async () => {
    try {
      if (tenantId) {
        await svc(`/rest/v1/profiles?id=eq.${user.id}`, { method: "DELETE" });
        await svc(`/rest/v1/tenant_config?tenant_id=eq.${tenantId}`, { method: "DELETE" });
        await svc(`/rest/v1/tenants?id=eq.${tenantId}`, { method: "DELETE" });
      }
    } catch {
      /* best-effort */
    }
  };

  try {
    tenantId = await uniqueSlug(companyName);
    let r = await svc(`/rest/v1/tenants`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: tenantId, name: companyName }),
    });
    if (!r.ok) throw new Error(`create tenant failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    r = await svc(`/rest/v1/tenant_config`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        tenant_id: tenantId,
        company_name: companyName,
        support_email: user.email,
        plan_tier: planTier,
        crew_addon: false,
        internal: false,
      }),
    });
    if (!r.ok) throw new Error(`create tenant_config failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    r = await svc(`/rest/v1/profiles`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: user.id, tenant_id: tenantId, role: "owner" }),
    });
    if (!r.ok) throw new Error(`create profile failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    return json({ ok: true, tenantId });
  } catch (e) {
    await rollback();
    return json({ ok: false, error: `provision failed: ${e.message}` }, 502);
  }
};
