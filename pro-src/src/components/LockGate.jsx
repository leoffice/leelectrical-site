// LockGate (task #39) — full-screen unlock shown on every fresh app open,
// BEFORE the app content mounts. Primary: device biometric (Face ID /
// fingerprint) via the WebAuthn platform authenticator — prompted immediately
// on a cold open only (reload → password first; camera blocked → password only).
// Fallback: Supabase email + password. Agent access: one-time owner-minted code.
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
import { getCompanyLogoSrc } from "../lib/appSettings.js";
import { productName, tenantName } from "../lib/tenantBranding.js";
import { redeemAgentAccess } from "../lib/agentAccessClient.js";

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
  const [mode, setMode] = useState("biometric"); // "biometric" | "password" | "agent"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agentCode, setAgentCode] = useState("");

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

  // Poll agent session expiry so the lock reappears when the grant ends.
  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => {
      if (!isSessionUnlocked()) setUnlocked(false);
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
        await passwordUnlock(email, password);
        succeed();
      } catch (e2) {
        setErr(e2?.message || "Invalid email or password");
      } finally {
        setBusy(false);
      }
    },
    [email, password, succeed]
  );

  const runAgentCode = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setErr("");
      setBusy(true);
      try {
        const result = await redeemAgentAccess(agentCode, { label: "agent" });
        markAgentUnlocked({
          token: result.token,
          grantId: result.session?.grantId,
          scope: result.session?.scope,
          startedAt: result.session?.startedAt,
          expiresAt: result.session?.expiresAt,
          label: result.session?.label || "agent",
        });
        setUnlocked(true);
      } catch (e2) {
        setErr(e2?.message || "Code not accepted");
      } finally {
        setBusy(false);
      }
    },
    [agentCode]
  );

  if (unlocked) return children;

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
            : mode === "agent"
              ? "Agent access · enter the code from Settings"
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
            <button
              type="button"
              onClick={() => {
                abortBiometric();
                setErr("");
                setMode("agent");
              }}
              className="mt-3 text-sm text-white/70 underline underline-offset-2"
              data-testid="lock-use-agent"
            >
              Have an agent code?
            </button>
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
            <button
              type="button"
              onClick={() => {
                setErr("");
                setMode("agent");
              }}
              className="text-sm text-white/70 underline underline-offset-2 mt-1"
              data-testid="lock-use-agent"
            >
              Have an agent code?
            </button>
          </form>
        )}

        {mode === "agent" && (
          <form onSubmit={runAgentCode} className="w-full flex flex-col gap-3" data-testid="lock-agent-form">
            <input
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              value={agentCode}
              onChange={(e) => setAgentCode(e.target.value.toUpperCase())}
              className="w-full rounded-xl px-4 py-3.5 text-base text-slate-900 outline-none tracking-[0.2em] font-mono text-center"
              data-testid="lock-agent-code"
              required
              maxLength={12}
            />
            <button
              type="submit"
              disabled={busy || !agentCode.trim()}
              className="w-full rounded-xl bg-white text-brand font-extrabold px-4 py-3.5 text-base active:bg-white/90 disabled:opacity-50"
              data-testid="lock-agent-submit"
            >
              {busy ? "Checking…" : "Enter with code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setErr("");
                setMode("password");
              }}
              className="text-sm text-white/80 underline underline-offset-2 mt-1"
              data-testid="lock-agent-back"
            >
              Back to password
            </button>
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
