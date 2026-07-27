// Server-side tenant resolution for the KV data plane.
//
// The business-data functions (state, jobsdata, settings, customers, …) used to
// read/write ONE fixed key with no auth — every deployment was "one tenant."
// This resolves the tenant from the SIGNED-IN USER'S Supabase session so a
// single deployment serves many isolated tenants, and namespaces their KV keys.
//
// SECURITY MODEL — why a tenant cannot spoof another's id:
//   The client sends its Supabase access token as `Authorization: Bearer <jwt>`.
//   We resolve the tenant by reading the caller's OWN profile row through
//   PostgREST *with that same token* (RLS `profiles_self` returns only their
//   row). Supabase rejects an invalid/expired token, and RLS makes it
//   impossible to read any other user's row. So the tenant_id we scope by is
//   provably the one that belongs to the token — never a value the client chose.
//   A `tenant` field in the request body is IGNORED on purpose.
//
// LE preservation: tenant `le` maps to the LEGACY key namespace (see
// tenantScopedStore) so existing LE data needs no migration.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";

// The incumbent single tenant. A tokenless request (old cached client, agent
// access code, server-to-server) resolves here — identical to today's behavior
// and never a cross-tenant path (a real tenant B user always carries a token).
export const DEFAULT_TENANT = process.env.TENANT_ID || "le";

// When "1", a request we cannot attribute to a tenant is DENIED instead of
// falling back to DEFAULT_TENANT. Off by default so LE keeps working through
// the client rollout; flip on once every client attaches a token.
const STRICT = process.env.TENANT_STRICT === "1" || process.env.TENANT_STRICT === "true";

// token -> { tenant, exp } cache, per Worker isolate. state is polled often, so
// without this every poll would hit Supabase. Bounded by the JWT's own expiry.
const CACHE = new Map();
const CACHE_MAX_MS = 60_000;
const CACHE_CAP = 500;

/** Tenant ids are slugs; refuse anything that could smuggle a key separator. */
export function isValidTenantId(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
}

function bearer(req) {
  try {
    const h = (req.headers && req.headers.get && req.headers.get("authorization")) || "";
    const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    return m && m[1] ? m[1].trim() : "";
  } catch {
    return "";
  }
}

/** Best-effort JWT `exp` (seconds) — used ONLY to bound the cache TTL, never for trust. */
function jwtExpMs(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = Number(JSON.parse(json).exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function cacheGet(token) {
  const hit = CACHE.get(token);
  if (hit && hit.exp > Date.now()) return hit.tenant;
  if (hit) CACHE.delete(token);
  return undefined;
}

function cacheSet(token, tenant, tokenExpMs) {
  if (CACHE.size >= CACHE_CAP) CACHE.clear(); // crude bound; fine for an edge isolate
  const ttl = Math.min(CACHE_MAX_MS, Math.max(1000, (tokenExpMs || 0) - Date.now()) || CACHE_MAX_MS);
  CACHE.set(token, { tenant, exp: Date.now() + ttl });
}

/**
 * Resolve the tenant for a request. Returns a tenant id string, or `null` only
 * in STRICT mode when the caller cannot be attributed.
 *
 * @param {Request} req
 * @param {{ fetchImpl?: typeof fetch }} [opts]  fetchImpl is injectable for tests
 * @returns {Promise<string|null>}
 */
export async function resolveTenant(req, { fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  const token = bearer(req);

  // TOKENLESS: the only path that may use the incumbent fallback. This is the
  // backward-compat door for old cached clients and server/webhook callers that
  // don't carry a Supabase session. A tokenless caller is never attributed to
  // any tenant but LE, so it cannot reach another tenant's data.
  if (!token) return STRICT ? null : DEFAULT_TENANT;

  // TOKEN PRESENT: it MUST resolve to a tenant. If it doesn't (invalid/expired
  // token, or an authenticated user with no provisioned profile row, or a
  // transient Supabase failure) we DENY rather than fall back to LE — falling
  // back would hand LE's data to a non-LE identity. Fail closed.
  const cached = cacheGet(token);
  if (cached !== undefined) return cached;
  if (!doFetch) return null;

  let tenant = null;
  try {
    const res = await doFetch(`${SUPABASE_URL}/rest/v1/profiles?select=tenant_id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (res && res.ok) {
      let rows = [];
      try {
        rows = await res.json();
      } catch {
        rows = [];
      }
      const raw = Array.isArray(rows) && rows[0] ? rows[0].tenant_id : null;
      if (raw != null && isValidTenantId(String(raw))) tenant = String(raw);
    }
  } catch {
    // network/Supabase failure — treated as unresolved → deny (fail closed)
  }

  // Only cache a positive resolution. A failed lookup must not pin a deny for a
  // token that recovers on the next call.
  if (tenant) cacheSet(token, tenant, jwtExpMs(token));
  return tenant; // null when unresolved → caller denies (401)
}

/** Test/ops hook — drop the per-isolate cache. */
export function _clearTenantCache() {
  CACHE.clear();
}
