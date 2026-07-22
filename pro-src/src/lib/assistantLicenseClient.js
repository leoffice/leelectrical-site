// Client for AI Assistant paid license tokens (owner unlimited + customer paid).
import { functionsBase } from "./functionsBase.js";

const STORAGE_KEY = "lepro_assistant_license";

function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

async function post(body) {
  const res = await fetch(`${functionsBase()}/assistant-license`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `assistant-license: HTTP ${res.status}`);
  }
  return data;
}

export async function fetchAssistantLicenseStatus() {
  const res = await fetch(`${functionsBase()}/assistant-license?cb=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`assistant-license: HTTP ${res.status}`);
  return res.json();
}

/** Mint owner (unlimited for you) or paid (customer who paid). Token shown once. */
export async function mintAssistantLicense({ kind, label } = {}) {
  return post({ op: "mint", kind: kind || "paid", label });
}

export async function revokeAssistantLicense(licenseId) {
  return post({ op: "revoke", licenseId });
}

/** Validate + activate a token on this device. */
export async function activateAssistantLicense(token) {
  const data = await post({ op: "validate", token });
  if (data.entitled && token) {
    setStoredAssistantToken(token, data.license);
  }
  return data;
}

export function getStoredAssistantToken() {
  const s = localStore();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.token) return null;
    return obj;
  } catch {
    return null;
  }
}

export function setStoredAssistantToken(token, license) {
  const s = localStore();
  if (!s) return;
  if (!token) {
    s.removeItem(STORAGE_KEY);
    return;
  }
  s.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: String(token),
      license: license || null,
      activatedAt: Date.now(),
    })
  );
}

export function clearStoredAssistantToken() {
  setStoredAssistantToken(null);
}

/**
 * Whether this device/session may use the AI assistant.
 * Internal (LE) tenants always pass — you sell the feature.
 * Everyone else needs a stored valid token (revalidated when possible).
 */
export function isAssistantEntitledLocally({ internal } = {}) {
  if (internal === true) return true;
  const stored = getStoredAssistantToken();
  return !!(stored && stored.token);
}

/** Revalidate stored token with the server. Clears storage if revoked/invalid. */
export async function refreshAssistantEntitlement({ internal } = {}) {
  if (internal === true) {
    return { entitled: true, reason: "owner" };
  }
  const stored = getStoredAssistantToken();
  if (!stored?.token) {
    return { entitled: false, reason: "no_token" };
  }
  try {
    const data = await activateAssistantLicense(stored.token);
    return { entitled: true, reason: "token", license: data.license };
  } catch {
    clearStoredAssistantToken();
    return { entitled: false, reason: "invalid" };
  }
}
