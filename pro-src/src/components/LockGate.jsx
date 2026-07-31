// LockGate (task #39) — full-screen unlock shown on every fresh app open,
// BEFORE the app content mounts. Primary: device biometric (Face ID /
// fingerprint) via the WebAuthn platform authenticator — prompted immediately
// on a cold open only (reload → password first; camera blocked → password only).
// Fallback: Supabase email + password.
// Agent: "Enter as agent" when Agent Access toggle is ON (no codes — fleet identity).
// In-session grace keeps mid-session reloads from re-prompting; a fresh launch re-locks.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  biometricSupported,
  biometricUnlock,
  hasEnrolledCredential,
  isSessionUnlocked,
  markAgentUnlocked,
  markUnlocked,
  mediaPermissionDenied,
  passwordUnlock,
  shouldAutoBiometric,
  touchUnlocked,
} from "../lib/lock.js";
import { saveSession } from "../lib/session.js";
import { getCompanyLogoSrc } from "../lib/appSettings.js";
import { productName, tenantName } from "../lib/tenantBranding.js";
import { DEMO, DEMO_CREDENTIALS } from "../lib/demoMode.js";
import { enterAsAgent, fetchAgentAccessStatus } from "../lib/agentAccessClient.js";

// A pending native passkey prompt must never trap the user. If the device
// never answers (no platform authenticator, unenrolled, hung WebAuthn call),
// auto-abort and drop to the password view instead of spinning forever.
export const BIOMETRIC_TIMEOUT_MS = 25000;

export default function LockGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    const ok = isSessionUnlocked();
    if (ok) touchUnlocked();
    return ok;
  });
  const [bioAvail, setBioAvail] = useState(false);
  // Demo builds land straight on the password view with the login pre-filled.
  const [mode, setMode] = useState(DEMO ? "password" : "biometric"); // "biometric" | "password"
  const [busy, setBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState(DEMO ? DEMO_CREDENTIALS.email : "");
  const [password, setPassword] = useState(DEMO ? DEMO_CREDENTIALS.password : "");
  /** Agent Access toggle ON → show "Enter as agent" (unauth status GET). */
  const [agentAccessOn, setAgentAccessOn] = useState(false);

  const enrolled = hasEnrolledCredential();
  const autoBioRan = useRef(false);
  const autoBioAllowed = useRef(false);
  // Controls the in-flight navigator.credentials.get()/create() call so a
  // fallback tap or the watchdog timeout can dismiss the native prompt.
  const abortRef = useRef(null);
  const bioTimerRef = useRef(null);

  const succeed = useCallback(() => {
    markUnlocked();
    setUnlocked(true);
  }, []);

  // Cancel any pending WebAuthn call and clear its watchdog. Safe to call any
  // number of times; leaves the chosen view intact for the caller to set.
  const abortBiometric = useCallback(() => {
    if (bioTimerRef.current) {
      clearTimeout(bioTimerRef.current);
      bioTimerRef.current = null;
    }
    const controller = abortRef.current;
    abortRef.current = null;
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* AbortController unavailable */
      }
    }
    setBusy(false);
  }, []);

  // Tear down any in-flight prompt if the gate unmounts.
  useEffect(() => () => abortBiometric(), [abortBiometric]);

  // Detect biometric availability; skip auto-prompt on reload or blocked camera.
  useEffect(() => {
    if (unlocked) return;
    // Demo: no passkeys on a shared demo URL — password login only.
    if (DEMO) {
      setBioAvail(false);
      setMode("password");
      return;
    }
    let alive = true;
    (async () => {
      const [ok, camBlocked, auto] = await Promise.all([
        biometricSupported(),
        mediaPermissionDenied("camera"),
        shouldAutoBiometric(),
      ]);
      if (!alive) return;
      autoBioAllowed.current = auto;
      setBioAvail(ok && !camBlocked);
      if (!ok || camBlocked || !auto) setMode("password");
    })();
    return () => {
      alive = false;
    };
  }, [unlocked]);

  // Pre-unlock: show "Enter as agent" when the owner toggle is ON.
  useEffect(() => {
    if (unlocked || DEMO) return;
    let alive = true;
    (async () => {
      try {
        const st = await fetchAgentAccessStatus();
        if (!alive) return;
        setAgentAccessOn(st.accessOn === true || st.state?.accessOn === true);
      } catch {
        if (alive) setAgentAccessOn(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [unlocked]);

  // Poll agent session expiry + owner STOP so the lock reappears when access ends.
  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(async () => {
      if (!isSessionUnlocked()) {
        setUnlocked(false);
        return;
      }
      // If an agent UI session is active, re-check toggle (STOP / auto-off).
      try {
        const raw = globalThis.sessionStorage?.getItem("lepro_agent_session");
        if (!raw) return;
        const st = await fetchAgentAccessStatus();
        if (st.accessOn === false || st.state?.accessOn === false) {
          try {
            globalThis.sessionStorage?.removeItem("lepro_agent_session");
          } catch {
            /* ignore */
          }
          setUnlocked(false);
        }
      } catch {
        /* network blip — keep session until expiresAt */
      }
    }, 15000);
    return () => clearInterval(id);
  }, [unlocked]);

  const runBiometric = useCallback(async () => {
    setErr("");
    setBusy(true);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;
    // Watchdog: never leave the user stuck on "Waiting for device…".
    if (bioTimerRef.current) clearTimeout(bioTimerRef.current);
    bioTimerRef.current = setTimeout(() => {
      bioTimerRef.current = null;
      // Only fire if this call is still the active one and hasn't resolved.
      if (abortRef.current !== controller) return;
      abortRef.current = null;
      try {
        controller?.abort();
      } catch {
        /* AbortController unavailable */
      }
      setErr("Face ID / fingerprint timed out. Use your password instead.");
      setMode("password");
      setBusy(false);
    }, BIOMETRIC_TIMEOUT_MS);
    try {
      await biometricUnlock({ signal: controller?.signal });
      succeed();
    } catch (e) {
      // Aborted by a fallback tap or the watchdog → the view/message is already
      // set by whoever aborted; don't clobber it.
      if (e?.name === "AbortError" || controller?.signal?.aborted) return;
      // Cancelled / failed / unavailable → offer the password fallback.
      setErr(
        e?.name === "NotAllowedError"
          ? "Biometric cancelled. Use your password instead."
          : "Biometric unavailable. Use your password instead."
      );
      setMode("password");
    } finally {
      if (bioTimerRef.current) {
        clearTimeout(bioTimerRef.current);
        bioTimerRef.current = null;
      }
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }, [succeed]);

  // Cold open only → fingerprint/Face ID right away (reload uses password first).
  useEffect(() => {
    if (unlocked || !bioAvail || !autoBioAllowed.current || mode !== "biometric" || busy || autoBioRan.current)
      return;
    autoBioRan.current = true;
    runBiometric();
  }, [unlocked, bioAvail, mode, busy, runBiometric]);

  const retryBiometric = useCallback(() => {
    setErr("");
    setMode("biometric");
    autoBioRan.current = true;
    runBiometric();
  }, [runBiometric]);

  const runPassword = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setErr("");
      setBusy(true);
      try {
        const session = await passwordUnlock(email, password);
        // Persist the Supabase session so data-plane requests carry the user's
        // token — the server resolves the tenant from it and isolates the store.
        saveSession(session);
        succeed();
      } catch (e2) {
        setErr(e2?.message || "Invalid email or password");
      } finally {
        setBusy(false);
      }
    },
    [email, password, succeed]
  );

  /** Enter as agent — bypass biometric/password; mint signed session via fleet identity. */
  const runEnterAsAgent = useCallback(async () => {
    setErr("");
    setAgentBusy(true);
    abortBiometric();
    try {
      // Re-check toggle so we never enter when Levi already turned it off.
      try {
        const st = await fetchAgentAccessStatus();
        if (st.accessOn !== true && st.state?.accessOn !== true) {
          setAgentAccessOn(false);
          setErr("agent access is off");
          return;
        }
      } catch {
        /* mint path will enforce */
      }
      const session = await enterAsAgent();
      markAgentUnlocked(session);
      setUnlocked(true);
    } catch (e2) {
      const code = e2?.code || "";
      if (code === "access_off") {
        setAgentAccessOn(false);
        setErr("agent access is off");
      } else if (code === "identity_missing" || code === "identity_fail") {
        setErr(e2?.message || "Agent identity required.");
      } else {
        setErr(e2?.message || "Could not enter as agent");
      }
    } finally {
      setAgentBusy(false);
    }
  }, [abortBiometric]);

  if (unlocked) return children;

  const agentEntryButton = agentAccessOn ? (
    <button
      type="button"
      onClick={() => {
        abortBiometric();
        runEnterAsAgent();
      }}
      disabled={agentBusy || busy}
      className="mt-3 w-full rounded-xl bg-emerald-500/90 text-white font-extrabold px-4 py-3 text-base active:bg-emerald-500 disabled:opacity-50"
      data-testid="lock-enter-as-agent"
    >
      {agentBusy ? "Entering…" : "Enter as agent"}
    </button>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-slate-900 text-white pt-safe pb-safe"
      data-testid="lock-gate"
      role="dialog"
      aria-modal="true"
      aria-label={`Unlock ${productName()}`}
    >
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* LockGate renders BEFORE TenantProvider mounts (see main.jsx), so
            branding here comes from the device-cached logo and the build seed
            rather than server config. Good enough for the unlock screen; the
            in-app chrome uses the resolved config. */}
        <img
          src={getCompanyLogoSrc()}
          alt={tenantName() || "Company logo"}
          className="h-36 w-auto max-w-[320px] object-contain mb-4"
          data-testid="lock-logo"
        />
        <h1 className="text-2xl font-extrabold tracking-tight">{productName()}</h1>
        <p className="text-sm text-white/70 mb-8">
          {mode === "biometric" && bioAvail && busy
            ? enrolled
              ? "Confirm Face ID / fingerprint…"
              : "Set up Face ID / fingerprint…"
            : "Locked · unlock to continue"}
        </p>

        {mode === "biometric" && bioAvail && (
          <div className="w-full flex flex-col items-center">
            <div
              className={`w-24 h-24 rounded-full bg-white/15 grid place-items-center text-5xl mb-4 shadow-lg ${
                busy ? "animate-pulse" : ""
              }`}
              data-testid="lock-biometric"
              aria-hidden
            >
              {busy ? "…" : "👆"}
            </div>
            <div className="text-base font-semibold text-center">
              {busy
                ? "Waiting for device…"
                : enrolled
                  ? "Face ID / fingerprint"
                  : "Face ID / fingerprint setup"}
            </div>
            <button
              type="button"
              onClick={() => {
                abortBiometric();
                setErr("");
                setMode("password");
              }}
              className="mt-6 text-sm text-white/80 underline underline-offset-2"
              data-testid="lock-use-password"
            >
              Use password instead
            </button>
            {agentEntryButton}
          </div>
        )}

        {DEMO && mode === "password" && (
          <div
            className="w-full mb-4 rounded-xl bg-blue-500/20 border border-blue-300/40 text-white text-sm px-4 py-3 text-center"
            data-testid="demo-login-hint"
          >
            <div className="font-bold mb-1">Demo login — pre-filled, just tap Unlock</div>
            <div className="font-mono text-xs opacity-90">{DEMO_CREDENTIALS.email}</div>
            <div className="font-mono text-xs opacity-90">password: {DEMO_CREDENTIALS.password}</div>
          </div>
        )}

        {mode === "password" && (
          <form onSubmit={runPassword} className="w-full flex flex-col gap-3" data-testid="lock-password-form">
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-3.5 text-base text-slate-900 outline-none"
              data-testid="lock-email"
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3.5 text-base text-slate-900 outline-none"
              data-testid="lock-pass"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-white text-brand font-extrabold px-4 py-3.5 text-base active:bg-white/90 disabled:opacity-50"
              data-testid="lock-submit"
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            {bioAvail && (
              <button
                type="button"
                onClick={retryBiometric}
                className="text-sm text-white/80 underline underline-offset-2 mt-1"
                data-testid="lock-use-biometric"
              >
                Use {enrolled ? "biometrics" : "Face ID / fingerprint"} instead
              </button>
            )}
            {agentEntryButton}
          </form>
        )}

        {err && (
          <p className="mt-5 text-sm text-white bg-red-600/40 rounded-lg px-3 py-2 text-center" data-testid="lock-error">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
