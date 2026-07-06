// LockGate (task #39) — full-screen unlock shown on every fresh app open,
// BEFORE the app content mounts. Primary: device biometric (Face ID /
// fingerprint) via the WebAuthn platform authenticator. Fallback: Supabase
// email + password. A short in-session grace keeps a mid-session reload from
// re-prompting; a fresh launch re-locks.
import React, { useCallback, useEffect, useState } from "react";
import {
  biometricSupported,
  biometricUnlock,
  hasEnrolledCredential,
  isSessionUnlocked,
  markUnlocked,
  passwordUnlock,
} from "../lib/lock.js";

export default function LockGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => isSessionUnlocked());
  const [bioAvail, setBioAvail] = useState(false);
  const [mode, setMode] = useState("biometric"); // "biometric" | "password"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const enrolled = hasEnrolledCredential();

  const succeed = useCallback(() => {
    markUnlocked();
    setUnlocked(true);
  }, []);

  // Detect biometric availability; fall back to password if unavailable.
  useEffect(() => {
    if (unlocked) return;
    let alive = true;
    biometricSupported().then((ok) => {
      if (!alive) return;
      setBioAvail(ok);
      if (!ok) setMode("password");
    });
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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-gradient-to-br from-brand to-accent text-white pt-safe pb-safe"
      data-testid="lock-gate"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock LE Pro"
    >
      <div className="w-full max-w-sm flex flex-col items-center">
        <span className="grid place-items-center w-16 h-16 rounded-2xl bg-white/15 text-4xl mb-4">⚡</span>
        <h1 className="text-2xl font-extrabold tracking-tight">LE Pro</h1>
        <p className="text-sm text-white/70 mb-8">Locked · unlock to continue</p>

        {mode === "biometric" && bioAvail && (
          <div className="w-full flex flex-col items-center">
            <button
              type="button"
              onClick={runBiometric}
              disabled={busy}
              data-testid="lock-biometric"
              className="w-24 h-24 rounded-full bg-white/15 active:bg-white/25 grid place-items-center text-5xl mb-4 disabled:opacity-50 shadow-lg"
              aria-label={enrolled ? "Unlock with biometrics" : "Set up biometric unlock"}
            >
              {busy ? "…" : "👆"}
            </button>
            <div className="text-base font-semibold">
              {busy ? "Verifying…" : enrolled ? "Tap to unlock" : "Tap to set up Face ID / fingerprint"}
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
                onClick={() => {
                  setErr("");
                  setMode("biometric");
                }}
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
