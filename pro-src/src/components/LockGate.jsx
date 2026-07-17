// LockGate (task #39) — full-screen unlock shown on every fresh app open,
// BEFORE the app content mounts. Primary: device biometric (Face ID /
// fingerprint) via the WebAuthn platform authenticator — prompted immediately
// on a cold open only (reload → password first; camera blocked → password only).
// Fallback: Supabase email + password. In-session grace keeps mid-session
// reloads from re-prompting; a fresh launch re-locks.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  biometricSupported,
  biometricUnlock,
  hasEnrolledCredential,
  isSessionUnlocked,
  markUnlocked,
  mediaPermissionDenied,
  passwordUnlock,
  shouldAutoBiometric,
  touchUnlocked,
} from "../lib/lock.js";
import { getCompanyLogoSrc } from "../lib/appSettings.js";

export default function LockGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    const ok = isSessionUnlocked();
    if (ok) touchUnlocked();
    return ok;
  });
  const [bioAvail, setBioAvail] = useState(false);
  const [mode, setMode] = useState("biometric"); // "biometric" | "password"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const enrolled = hasEnrolledCredential();
  const autoBioRan = useRef(false);
  const autoBioAllowed = useRef(false);

  const succeed = useCallback(() => {
    markUnlocked();
    setUnlocked(true);
  }, []);

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

  const runBiometric = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      await biometricUnlock();
      succeed();
    } catch (e) {
      // Cancelled / failed / unavailable → offer the password fallback.
      setErr(
        e?.name === "NotAllowedError"
          ? "Biometric cancelled. Use your password instead."
          : "Biometric unavailable. Use your password instead."
      );
      setMode("password");
    } finally {
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

  if (unlocked) return children;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-slate-900 text-white pt-safe pb-safe"
      data-testid="lock-gate"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock LE Pro"
    >
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src={getCompanyLogoSrc()}
          alt="LE Electric"
          className="h-36 w-auto max-w-[320px] object-contain mb-4"
          data-testid="lock-logo"
        />
        <h1 className="text-2xl font-extrabold tracking-tight">LE Pro</h1>
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
                setErr("");
                setMode("password");
              }}
              className="mt-6 text-sm text-white/80 underline underline-offset-2"
              data-testid="lock-use-password"
            >
              Use password instead
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
