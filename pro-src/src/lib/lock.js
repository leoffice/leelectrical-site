// App-open lock (task #39).
//
// Every fresh launch of LE Pro must be UNLOCKED before the app content is shown.
//   Primary : device biometric via the WebAuthn *platform* authenticator
//             (Face ID / fingerprint). First use registers the platform
//             authenticator and stores the credential id locally; later opens
//             verify with navigator.credentials.get (userVerification required).
//   Fallback: Supabase email + password (same project as the /app landing).
//
// In-session grace means a mid-session reload does NOT re-prompt, but a fresh
// app open — which starts a new browsing session and clears sessionStorage —
// DOES prompt. sessionStorage is primary; localStorage holds a reload-only
// backup because iOS PWAs sometimes wipe sessionStorage on pull-to-refresh.
//
// This module is intentionally free of React so the logic is unit-testable in
// the vitest "node" environment; storage/crypto/network access is guarded and
// injectable.

import { productName } from "./tenantBranding.js";
import { DEMO, isDemoCredential } from "./demoMode.js";

export const GRACE_MS = 8 * 60 * 60 * 1000; // 8 hours — field day + reloads
export const CRED_KEY = "lepro_lock_cred_id"; // localStorage (persists across launches)
export const GRACE_KEY = "lepro_lock_unlocked_at"; // sessionStorage (cleared on fresh open)
export const GRACE_BACKUP_KEY = "lepro_lock_unlocked_at_reload"; // localStorage, reload-only fallback

// Supabase — same project/keys as app/index.html's landing gate.
export const SUPABASE_URL = "https://scgpxbubakfwypycugoa.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_3LZjnaH6r3gOITpZqgWEYA_na5Ue7Lu";

// ---- storage helpers (never throw if storage is unavailable) ----------------
function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}
function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// ---- grace window -----------------------------------------------------------

// Pure: is `unlockedAt` (ms epoch) within [now - windowMs, now]?
export function isWithinGrace(unlockedAt, now = Date.now(), windowMs = GRACE_MS) {
  const t = Number(unlockedAt);
  if (!Number.isFinite(t) || t <= 0) return false;
  const dt = now - t;
  return dt >= 0 && dt < windowMs;
}

export function isPageReload() {
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav?.type === "reload") return true;
    return performance.navigation?.type === 1;
  } catch {
    return false;
  }
}

/** True when the browser reports camera access is blocked (iOS ties this to Face ID). */
export async function mediaPermissionDenied(name = "camera") {
  try {
    if (!globalThis.navigator?.permissions?.query) return false;
    const status = await globalThis.navigator.permissions.query({ name });
    return status?.state === "denied";
  } catch {
    return false;
  }
}

/** Face ID auto-prompt only on a cold open — never on reload or when camera is blocked. */
export async function shouldAutoBiometric() {
  if (isPageReload()) return false;
  if (await mediaPermissionDenied("camera")) return false;
  return biometricSupported();
}

/** Optional agent-session check (lazy import avoided — key read only). */
function agentSessionStillValid(now) {
  try {
    const raw = sessionStore()?.getItem("lepro_agent_session");
    if (!raw) return null; // no agent session
    const obj = JSON.parse(raw);
    const exp = Number(obj?.expiresAt);
    if (!obj?.token || !Number.isFinite(exp)) return false;
    if (now >= exp) {
      sessionStore()?.removeItem("lepro_agent_session");
      return false;
    }
    return true;
  } catch {
    return null;
  }
}

export function isSessionUnlocked(now = Date.now()) {
  const agentOk = agentSessionStillValid(now);
  if (agentOk === false) {
    // Expired agent session → force re-lock.
    clearUnlockedKeysOnly();
    return false;
  }
  if (agentOk === true) return true;

  const s = sessionStore();
  if (s && isWithinGrace(s.getItem(GRACE_KEY), now)) return true;
  if (isPageReload()) {
    const backup = localStore()?.getItem(GRACE_BACKUP_KEY);
    if (isWithinGrace(backup, now)) {
      if (s) s.setItem(GRACE_KEY, backup);
      return true;
    }
  }
  return false;
}

function clearUnlockedKeysOnly() {
  sessionStore()?.removeItem(GRACE_KEY);
  localStore()?.removeItem(GRACE_BACKUP_KEY);
}

export function markUnlocked(now = Date.now()) {
  const t = String(now);
  sessionStore()?.setItem(GRACE_KEY, t);
  localStore()?.setItem(GRACE_BACKUP_KEY, t);
}

export function touchUnlocked(now = Date.now()) {
  if (isSessionUnlocked(now)) markUnlocked(now);
}

export function clearUnlocked() {
  clearUnlockedKeysOnly();
  try {
    sessionStore()?.removeItem("lepro_agent_session");
  } catch {
    /* storage unavailable */
  }
}

/**
 * Unlock after a validated agent access code.
 * Grace is clipped to the grant's remaining lifetime.
 */
export function markAgentUnlocked(session, now = Date.now()) {
  const exp = Number(session?.expiresAt);
  if (!session?.token || !Number.isFinite(exp) || exp <= now) {
    throw new Error("Agent session expired");
  }
  try {
    sessionStore()?.setItem(
      "lepro_agent_session",
      JSON.stringify({
        token: session.token,
        grantId: session.grantId,
        scope: session.scope || "full",
        startedAt: session.startedAt || now,
        expiresAt: exp,
        label: session.label || "agent",
      })
    );
  } catch {
    /* storage unavailable */
  }
  markUnlocked(now);
  return true;
}

/** End the session — re-lock on next load and bust cached app shell. */
export async function logOff() {
  clearUnlocked();
  try {
    sessionStore()?.clear();
  } catch {
    /* storage unavailable */
  }
  try {
    if (globalThis.caches) {
      const keys = await globalThis.caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("le-pro-")).map((k) => globalThis.caches.delete(k)));
    }
  } catch {
    /* cache API unavailable */
  }
  try {
    if (globalThis.navigator?.serviceWorker) {
      const regs = await globalThis.navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* SW unavailable */
  }
  globalThis.location?.reload();
}

// ---- stored credential id ---------------------------------------------------
export function getCredentialId() {
  const s = localStore();
  return s ? s.getItem(CRED_KEY) : null;
}
export function setCredentialId(id) {
  const s = localStore();
  if (s) s.setItem(CRED_KEY, id);
}
export function clearCredentialId() {
  const s = localStore();
  if (s) s.removeItem(CRED_KEY);
}
export function hasEnrolledCredential() {
  return !!getCredentialId();
}

// ---- base64url <-> ArrayBuffer ---------------------------------------------
export function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBuf(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function randomBytes(n) {
  const a = new Uint8Array(n);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return a;
}

// ---- WebAuthn platform authenticator ---------------------------------------

// Is a device biometric (platform authenticator) usable here?
export async function biometricSupported() {
  try {
    if (typeof globalThis.PublicKeyCredential === "undefined") return false;
    // WebAuthn requires a secure context (https or localhost).
    if (globalThis.isSecureContext === false) return false;
    if (!globalThis.navigator?.credentials) return false;
    return await globalThis.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// WebAuthn `rp.name` is config-driven, and that is SAFE — do not "fix" it back
// to a literal out of caution. Credentials are scoped by rp.id (the hostname,
// set below and unchanged here); rp.name is a display-only label the OS shows
// in the Face ID / fingerprint prompt. Changing it does NOT invalidate any
// already-enrolled passkey.
const rpName = () => productName();

// First-use enrollment: create a platform credential and remember its id.
// `signal` (optional AbortSignal) lets the UI cancel a pending native prompt.
export async function registerBiometric({ label, signal } = {}) {
  // Shown next to the passkey in OS/browser settings; display-only, like rp.name.
  const userLabel = label || `${productName()} user`;
  const publicKey = {
    challenge: randomBytes(32),
    rp: { name: rpName(), id: globalThis.location?.hostname },
    user: {
      id: randomBytes(16),
      name: userLabel,
      displayName: userLabel,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  };
  const cred = await globalThis.navigator.credentials.create({ publicKey, signal });
  if (!cred) throw new Error("Enrollment cancelled");
  const id = bufToB64url(cred.rawId);
  setCredentialId(id);
  return id;
}

// Later opens: verify the stored platform credential with user verification.
// `signal` (optional AbortSignal) lets the UI cancel a pending native prompt.
export async function verifyBiometric(credId = getCredentialId(), { signal } = {}) {
  if (!credId) throw new Error("No enrolled credential");
  const publicKey = {
    challenge: randomBytes(32),
    allowCredentials: [{ type: "public-key", id: b64urlToBuf(credId) }],
    userVerification: "required",
    timeout: 60000,
    rpId: globalThis.location?.hostname,
  };
  const assertion = await globalThis.navigator.credentials.get({ publicKey, signal });
  if (!assertion) throw new Error("Verification failed");
  return true;
}

// Enroll-if-needed then verify — the single entry point the UI calls.
// `signal` is forwarded so a UI-side AbortController can dismiss the pending
// native WebAuthn prompt and free the page (see LockGate escape hatches).
export async function biometricUnlock({ signal } = {}) {
  if (hasEnrolledCredential()) {
    return verifyBiometric(getCredentialId(), { signal });
  }
  await registerBiometric({ signal });
  return true;
}

// ---- Supabase password fallback --------------------------------------------
// Hits the same GoTrue endpoint that supabase.auth.signInWithPassword uses.
export async function passwordUnlock(
  email,
  password,
  { fetchImpl = globalThis.fetch, url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY } = {}
) {
  // DEMO / white-label TEST TENANT: the pre-loaded demo login is validated
  // locally and never sent to Supabase (the demo has no real auth backend).
  if (DEMO) {
    if (isDemoCredential(email, password)) {
      return { access_token: "demo-session", token_type: "bearer", demo: true };
    }
    throw new Error("Use the demo login shown below.");
  }
  if (!fetchImpl) throw new Error("Network unavailable");
  const res = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email: String(email || "").trim(), password: password || "" }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.msg || data.error || "Invalid email or password"
    );
  }
  return data;
}
