/**
 * Self-serve tenant signup — SERVICE-ROLE provisioning for white-label.
 *
 * Creates, atomically (with rollback on partial failure):
 *   1. tenants           row  (generated slug id)
 *   2. tenant_config     row  (branding defaults + a self-serve plan tier)
 *   3. auth user         (Supabase Auth admin API)
 *   4. profiles          row  (id = auth uid, tenant_id = slug, role 'owner')
 *
 * RLS resolves a user's tenant from profiles.tenant_id via app_tenant_id(), so
 * no custom access-token hook is needed — the profiles row IS the binding.
 *
 * POST { email, password, companyName, ownerName?, planTier? }
 *   -> { ok:true, tenantId, userId }
 *
 * SECURITY / OPS:
 *   • Requires SUPABASE_SERVICE_ROLE_KEY (server-only — never shipped to client).
 *   • FAIL-CLOSED: returns 403 unless SIGNUP_ENABLED=1. This endpoint mints
 *     tenants + auth users, so it stays off until abuse controls (captcha /
 *     rate-limit / invite-code) are wired in front of it. See TODO below.
 *   • planTier is clamped to self-serve tiers — a signup can NEVER create
 *     'full', internal=true, or the crew add-on. Those are billing upgrades,
 *     granted only by a separate service-role path (and pinned by migration 003).
 *   • The trigger from 003 lets service-role writes set plan_tier freely; we
 *     still set it explicitly and defensively.
 */

const URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED === "1" || process.env.SIGNUP_ENABLED === "true";

// Self-serve tiers only. 'full'/internal/crew are never reachable from signup.
const SELF_SERVE_TIERS = new Set(["free", "pro"]);

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders() });

const svc = (path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

// Slug: lowercase alnum + single hyphens, 2..32 chars, never empty.
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

async function emailExists(email) {
  // Admin list is paged; a small scan is fine at signup volume.
  for (let page = 1; page <= 20; page++) {
    const r = await svc(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!r.ok) throw new Error(`user lookup failed: HTTP ${r.status}`);
    const { users = [] } = await r.json();
    if (users.some((u) => (u.email || "").toLowerCase() === email.toLowerCase())) return true;
    if (users.length < 200) break;
  }
  return false;
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!KEY) return json({ ok: false, error: "server not configured" }, 500);
  if (!SIGNUP_ENABLED) return json({ ok: false, error: "signups are not open" }, 403);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const companyName = String(body.companyName || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const planTier = SELF_SERVE_TIERS.has(body.planTier) ? body.planTier : "free";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "valid email required" }, 400);
  if (password.length < 8) return json({ ok: false, error: "password must be at least 8 characters" }, 400);
  if (companyName.length < 2) return json({ ok: false, error: "company name required" }, 400);

  // Pre-flight: reject a duplicate email before creating any tenant rows.
  try {
    if (await emailExists(email)) return json({ ok: false, error: "an account with that email already exists" }, 409);
  } catch (e) {
    return json({ ok: false, error: `signup unavailable: ${e.message}` }, 502);
  }

  // Track what we create so a later step's failure can roll the earlier ones back.
  let tenantId = null;
  let userId = null;
  const rollback = async () => {
    try {
      if (userId) await svc(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
      if (tenantId) {
        await svc(`/rest/v1/profiles?tenant_id=eq.${tenantId}`, { method: "DELETE" });
        await svc(`/rest/v1/tenant_config?tenant_id=eq.${tenantId}`, { method: "DELETE" });
        await svc(`/rest/v1/tenants?id=eq.${tenantId}`, { method: "DELETE" });
      }
    } catch {
      /* best-effort cleanup; surfaced to the caller as a generic failure */
    }
  };

  try {
    // 1) tenant
    tenantId = await uniqueSlug(companyName);
    let r = await svc(`/rest/v1/tenants`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: tenantId, name: companyName }),
    });
    if (!r.ok) throw new Error(`create tenant failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    // 2) tenant_config — branding defaults, self-serve tier, never internal/crew.
    r = await svc(`/rest/v1/tenant_config`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        tenant_id: tenantId,
        company_name: companyName,
        support_email: email,
        plan_tier: planTier,
        crew_addon: false,
        internal: false,
      }),
    });
    if (!r.ok) throw new Error(`create tenant_config failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    // 3) auth user. email_confirm:true keeps this wireable now; production
    //    should instead trigger an email-verification flow (see TODO).
    r = await svc(`/auth/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: ownerName ? { full_name: ownerName } : {},
        app_metadata: { tenant_id: tenantId },
      }),
    });
    if (!(r.status === 200 || r.status === 201))
      throw new Error(`create auth user failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    userId = (await r.json())?.id;
    if (!userId) throw new Error("auth user created without an id");

    // 4) profiles — the tenant binding + owner role.
    r = await svc(`/rest/v1/profiles`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: userId, tenant_id: tenantId, role: "owner" }),
    });
    if (!r.ok) throw new Error(`create profile failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    return json({ ok: true, tenantId, userId });
  } catch (e) {
    await rollback();
    return json({ ok: false, error: `signup failed: ${e.message}` }, 502);
  }
};

// TODO before opening SIGNUP_ENABLED to the public:
//   • Put a bot/abuse gate in front (Turnstile/captcha + IP rate-limit) — this
//     endpoint mints auth users + tenants on every call.
//   • Switch step 3 to email-verification (email_confirm:false + confirmation
//     mail) so unverified emails cannot hold a tenant.
//   • Decide the CF Pages deployment shape: as a Pages Function this needs an
//     onRequest(context) wrapper reading context.env (see functions/pay/[code].js)
//     rather than process.env.
