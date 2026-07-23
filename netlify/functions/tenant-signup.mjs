/**
 * Self-serve tenant signup — SERVICE-ROLE provisioning for white-label.
 *
 * Flow (atomic, with rollback on partial failure):
 *   0. Turnstile — verify the bot-gate token (fail-closed).
 *   1. tenants        row  (generated slug id)
 *   2. tenant_config  row  (branding defaults + a self-serve plan tier)
 *   3. auth user      via admin generate_link(type:signup) — creates the user
 *      UNCONFIRMED and issues the email-verification link (Supabase mails it
 *      when the project has SMTP + "Confirm email" on). Returns the user id.
 *   4. profiles       row  (id = auth uid, tenant_id = slug, role 'owner')
 *
 * The account cannot be used until the owner clicks the verification link
 * (login returns "Email not confirmed" until then). RLS resolves a user's
 * tenant from profiles.tenant_id via app_tenant_id() — the profiles row IS the
 * binding, so no custom access-token hook is needed.
 *
 * POST { email, password, companyName, ownerName?, planTier?, cfTurnstileToken }
 *   -> { ok:true, tenantId, userId, status:"verify-email" }
 *
 * SECURITY / OPS:
 *   • Requires SUPABASE_SERVICE_ROLE_KEY (server-only — never shipped to client).
 *   • FAIL-CLOSED: 403 unless SIGNUP_ENABLED=1. Stays off until Levi's go.
 *   • Bot gate: requires TURNSTILE_SECRET_KEY + a passing token, else 400.
 *   • planTier clamped to self-serve tiers — signup can NEVER create 'full',
 *     internal=true, or crew_addon (billing upgrades; also pinned by mig 003).
 */

const URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED === "1" || process.env.SIGNUP_ENABLED === "true";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
// Where the verification link returns the user after confirming.
const SIGNUP_REDIRECT = process.env.SIGNUP_REDIRECT_URL || "https://www.leelectrical.us/app/";

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

// ---- Turnstile bot gate ----------------------------------------------------
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET) return { ok: false, reason: "captcha not configured" };
  if (!token) return { ok: false, reason: "missing token" };
  const form = new URLSearchParams();
  form.set("secret", TURNSTILE_SECRET);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  let d = {};
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    d = await r.json();
  } catch (e) {
    return { ok: false, reason: `verify unreachable: ${e.message}` };
  }
  return { ok: d.success === true, reason: (d["error-codes"] || []).join(",") };
}

// ---- slug -------------------------------------------------------------------
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

  // 0) Bot gate FIRST — before any lookup or write.
  const ip =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const cap = await verifyTurnstile(body.cfTurnstileToken || body.turnstileToken, ip);
  if (!cap.ok) return json({ ok: false, error: `captcha failed${cap.reason ? ` (${cap.reason})` : ""}` }, 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const companyName = String(body.companyName || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const planTier = SELF_SERVE_TIERS.has(body.planTier) ? body.planTier : "free";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "valid email required" }, 400);
  if (password.length < 8) return json({ ok: false, error: "password must be at least 8 characters" }, 400);
  if (companyName.length < 2) return json({ ok: false, error: "company name required" }, 400);

  try {
    if (await emailExists(email)) return json({ ok: false, error: "an account with that email already exists" }, 409);
  } catch (e) {
    return json({ ok: false, error: `signup unavailable: ${e.message}` }, 502);
  }

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
      /* best-effort cleanup */
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

    // 3) auth user + email verification, in one call. generate_link(type:signup)
    //    creates the user UNCONFIRMED and issues the confirmation link; Supabase
    //    emails it when the project has SMTP + "Confirm email" enabled. We never
    //    return the link (it confirms the account — only the email owner gets it).
    r = await svc(`/auth/v1/admin/generate_link`, {
      method: "POST",
      body: JSON.stringify({
        type: "signup",
        email,
        password,
        data: ownerName ? { full_name: ownerName } : {},
        redirect_to: SIGNUP_REDIRECT,
      }),
    });
    if (!(r.status === 200 || r.status === 201))
      throw new Error(`create auth user failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    const gl = await r.json();
    userId = gl?.user?.id || gl?.id || gl?.user_id;
    if (!userId) throw new Error("auth user created without an id");

    // 4) profiles — the tenant binding + owner role.
    r = await svc(`/rest/v1/profiles`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: userId, tenant_id: tenantId, role: "owner" }),
    });
    if (!r.ok) throw new Error(`create profile failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    return json({ ok: true, tenantId, userId, status: "verify-email" });
  } catch (e) {
    await rollback();
    return json({ ok: false, error: `signup failed: ${e.message}` }, 502);
  }
};

// TODO before opening SIGNUP_ENABLED=1 to the public:
//   • Provision the Turnstile widget (CF dashboard) → set TURNSTILE_SECRET_KEY
//     (server env) + the site key in signup.html. Until the secret is set this
//     endpoint refuses every request (fail-closed).
//   • Confirm email DELIVERY: the project must have SMTP configured + Auth
//     "Confirm email" ON so generate_link's message is actually sent. If you'd
//     rather not depend on Supabase SMTP, capture gl.properties.action_link and
//     send it through the repo's Resend path (see lib/docEmail / cloudflare-
//     email-service) — but never log or return the link.
//   • Add an IP rate-limit (KV counter) in front — Turnstile stops bots, not a
//     determined script reusing solved tokens across accounts.
//   • Reap unconfirmed signups (tenant+config+user with no confirmed login)
//     on a schedule so abandoned/abusive rows don't accumulate.
//   • CF Pages deploy shape: as a Pages Function this needs an onRequest(context)
//     wrapper reading context.env (see functions/pay/[code].js), and the file
//     must be ported into the cf-native tree (prod), like the dashboard fixes.
