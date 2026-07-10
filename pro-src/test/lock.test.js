// App-open lock (task #39) — logic tests: in-session grace window, credential
// storage, biometric availability detection, and the Supabase password
// fallback. Runs in the default "node" env (no jsdom) using injected globals.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRACE_MS,
  biometricSupported,
  clearCredentialId,
  clearUnlocked,
  getCredentialId,
  hasEnrolledCredential,
  isSessionUnlocked,
  isWithinGrace,
  logOff,
  markUnlocked,
  passwordUnlock,
  setCredentialId,
} from "../src/lib/lock.js";

// Minimal Storage shim.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => {
  globalThis.sessionStorage = memStorage();
  globalThis.localStorage = memStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("in-session grace window", () => {
  it("isWithinGrace honours the [now-window, now] band", () => {
    const now = 1_000_000;
    expect(isWithinGrace(now, now)).toBe(true); // just unlocked
    expect(isWithinGrace(now - (GRACE_MS - 1), now)).toBe(true); // barely inside
    expect(isWithinGrace(now - GRACE_MS, now)).toBe(false); // exactly at edge = expired
    expect(isWithinGrace(now - GRACE_MS - 1, now)).toBe(false); // stale
    expect(isWithinGrace(now + 5000, now)).toBe(false); // future timestamp
    expect(isWithinGrace(null, now)).toBe(false);
    expect(isWithinGrace("nope", now)).toBe(false);
  });

  it("markUnlocked → isSessionUnlocked within grace; expires after the window", () => {
    const t0 = 5_000_000;
    expect(isSessionUnlocked(t0)).toBe(false); // fresh open, nothing stored
    markUnlocked(t0);
    expect(isSessionUnlocked(t0 + 1000)).toBe(true); // reload during grace
    expect(isSessionUnlocked(t0 + GRACE_MS + 1)).toBe(false); // grace elapsed → re-prompt
  });

  it("clearUnlocked forces a re-prompt", () => {
    markUnlocked(Date.now());
    expect(isSessionUnlocked()).toBe(true);
    clearUnlocked();
    expect(isSessionUnlocked()).toBe(false);
  });

  it("a fresh open (empty sessionStorage) always prompts", () => {
    // Simulate relaunch: brand-new sessionStorage with no grace key.
    globalThis.sessionStorage = memStorage();
    expect(isSessionUnlocked()).toBe(false);
  });
});

describe("logOff", () => {
  it("clears unlock grace, session storage, app caches, and reloads", async () => {
    markUnlocked(Date.now());
    globalThis.sessionStorage.setItem("scratch", "x");
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const cacheDel = vi.fn(async () => true);
    vi.stubGlobal("caches", {
      keys: async () => ["le-pro-v68", "other"],
      delete: cacheDel,
    });
    const unregister = vi.fn(async () => true);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: async () => [{ unregister }] },
    });

    await logOff();

    expect(isSessionUnlocked()).toBe(false);
    expect(globalThis.sessionStorage.getItem("scratch")).toBe(null);
    expect(cacheDel).toHaveBeenCalledWith("le-pro-v68");
    expect(cacheDel).not.toHaveBeenCalledWith("other");
    expect(unregister).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});

describe("stored credential id (localStorage, survives launches)", () => {
  it("round-trips and reports enrollment", () => {
    expect(getCredentialId()).toBe(null);
    expect(hasEnrolledCredential()).toBe(false);
    setCredentialId("abc123");
    expect(getCredentialId()).toBe("abc123");
    expect(hasEnrolledCredential()).toBe(true);
    clearCredentialId();
    expect(hasEnrolledCredential()).toBe(false);
  });
});

describe("biometric availability detection", () => {
  it("false when WebAuthn is absent", async () => {
    expect(await biometricSupported()).toBe(false);
  });

  it("false in an insecure context even if the API exists", async () => {
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { credentials: {} });
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    });
    expect(await biometricSupported()).toBe(false);
  });

  it("true when a platform authenticator is available in a secure context", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { credentials: {} });
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    });
    expect(await biometricSupported()).toBe(true);
  });
});

describe("Supabase password fallback", () => {
  it("returns the session on a valid sign-in and posts to the token endpoint", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "tok", token_type: "bearer" }),
    }));
    const data = await passwordUnlock(" me@le.us ", "pw", { fetchImpl });
    expect(data.access_token).toBe("tok");
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain("/auth/v1/token?grant_type=password");
    expect(opts.headers.apikey).toBeTruthy();
    expect(JSON.parse(opts.body)).toEqual({ email: "me@le.us", password: "pw" }); // trimmed
  });

  it("throws the server message on bad credentials", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error_description: "Invalid login credentials" }),
    }));
    await expect(passwordUnlock("me@le.us", "bad", { fetchImpl })).rejects.toThrow(
      "Invalid login credentials"
    );
  });

  it("throws when the response has no access token", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    await expect(passwordUnlock("me@le.us", "pw", { fetchImpl })).rejects.toThrow();
  });
});
