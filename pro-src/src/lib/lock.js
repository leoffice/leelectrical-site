// App-open lock (task #39).
//
// Every fresh launch of LE Pro must be UNLOCKED before the app content is shown.
//   Primary : device biometric via the WebAuthn *platform* authenticator
//             (Face ID / fingerprint). First use registers the platform
//             authenticator and stores the credential id locally; later opens
//             verify with navigator.credentials.get (userVerification required).
//   Fallback: Supabase email + password (same project as the /app landing).
//
// A short in-session grace (stored in sessionStorage) means a mid-session
// reload does NOT re-prompt, but a fresh app open — which starts a new browsing
// session and clears sessionStorage — DOES prompt.
//
// This module is intentionally free of React so the logic is unit-testable in
// the vitest "node" environment; storage/crypto/network access is guarded and
// injectable.

export const GRACE_MS = 3 * 60 * 1000; // 3 minutes
export const CRED_KEY = "lepro_lock_cred_id"; // localStorage (persists across launches)
export const GRACE_KEY = "lepro_lock_unlocked_at"; // sessionStorage (cleared on fresh open)

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

export function isSessionUnlocked(now = Date.now()) {
  const s = sessionStore();
  if (!s) return false;
  return isWithinGrace(s.getItem(GRACE_KEY), now);
}

export function markUnlocked(now = Date.now()) {
  const s = sessionStore();
  if (s) s.setItem(GRACE_KEY, String(now));
}

export function clearUnlocked() {
  const s = sessionStore();
  if (s) s.removeItem(GRACE_KEY);
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

const RP_NAME = "LE Pro";

// First-use enrollment: create a platform credential and remember its id.
export async function registerBiometric({ label = "LE Pro user" } = {}) {
  const publicKey = {
    challenge: randomBytes(32),
    rp: { name: RP_NAME, id: globalThis.location?.hostname },
    user: {
      id: randomBytes(16),
      name: label,
      displayName: label,
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
  const cred = await globalThis.navigator.credentials.create({ publicKey });
  if (!cred) throw new Error("Enrollment cancelled");
  const id = bufToB64url(cred.rawId);
  setCredentialId(id);
  return id;
}

// Later opens: verify the stored platform credential with user verification.
export async function verifyBiometric(credId = getCredentialId()) {
  if (!credId) throw new Error("No enrolled credential");
  const publicKey = {
    challenge: randomBytes(32),
    allowCredentials: [{ type: "public-key", id: b64urlToBuf(credId) }],
    userVerification: "required",
    timeout: 60000,
    rpId: globalThis.location?.hostname,
  };
  const assertion = await globalThis.navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error("Verification failed");
  return true;
}

// Enroll-if-needed then verify — the single entry point the UI calls.
export async function biometricUnlock() {
  if (hasEnrolledCredential()) {
    return verifyBiometric();
  }
  await registerBiometric();
  return true;
}

// ---- Supabase password fallback --------------------------------------------
// Hits the same GoTrue endpoint that supabase.auth.signInWithPassword uses.
export async function passwordUnlock(
  email,
  password,
  { fetchImpl = globalThis.fetch, url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY } = {}
) {
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
