// Supabase session persistence for the data plane.
//
// The app authenticates through the lock (email+password → Supabase GoTrue).
// We persist that session so every business-data request can carry the user's
// access token as `Authorization: Bearer …`. The server (netlify/functions/
// lib/tenant.mjs) resolves the tenant from that token and namespaces the KV
// store — which is what actually isolates one tenant's data from another's.
//
// No token → the server falls back to the incumbent tenant (LE), i.e. exactly
// today's behavior, so existing sessions keep working through the rollout.
//
// This module is React-free and storage-guarded so it's unit-testable in the
// vitest "node" env, mirroring lock.js.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lock.js";

export const SESSION_KEY = "lepro_sb_session";
// Refresh when fewer than this many ms remain, so an in-flight request never
// races an expiry.
const REFRESH_SKEW_MS = 60_000;

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Normalize a GoTrue token response into our stored shape. */
function normalize(data) {
  if (!data || !data.access_token) return null;
  // GoTrue returns expires_at (epoch seconds) and/or expires_in (seconds).
  let expiresAt = Number(data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    const inSec = Number(data.expires_in);
    expiresAt = Number.isFinite(inSec) ? Math.floor(Date.now() / 1000) + inSec : 0;
  }
  return {
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : "",
    expires_at: expiresAt, // epoch SECONDS
    uid: data.user?.id || data.uid || "",
  };
}

/** Persist a login/refresh response. Pass the raw GoTrue JSON. */
export function saveSession(data) {
  const s = normalize(data);
  const ls = store();
  if (!ls) return s;
  try {
    if (s) ls.setItem(SESSION_KEY, JSON.stringify(s));
    else ls.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  return s;
}

export function readSession() {
  const ls = store();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    store()?.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

function expiresInMs(sess, now = Date.now()) {
  const at = Number(sess?.expires_at);
  if (!Number.isFinite(at) || at <= 0) return 0;
  return at * 1000 - now;
}

async function refresh(sess, { fetchImpl = globalThis.fetch, url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY } = {}) {
  if (!sess?.refresh_token || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ refresh_token: sess.refresh_token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return saveSession(data);
  } catch {
    return null;
  }
}

/**
 * Current access token, refreshing transparently when it's about to expire.
 * Returns "" when there is no usable session (unauthenticated → server uses
 * the incumbent tenant).
 */
export async function getAccessToken(opts = {}) {
  let sess = readSession();
  if (!sess?.access_token) return "";
  if (expiresInMs(sess) > REFRESH_SKEW_MS) return sess.access_token;
  // Expired / near-expiry — try a refresh; if it fails, drop the dead session.
  const refreshed = await refresh(sess, opts);
  if (refreshed?.access_token) return refreshed.access_token;
  clearSession();
  return "";
}

/** Header object to spread into a fetch — empty when unauthenticated. */
export async function authHeader(opts = {}) {
  const token = await getAccessToken(opts);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isSignedIn() {
  return !!readSession()?.access_token;
}
