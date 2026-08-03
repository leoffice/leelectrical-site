// LockGate (task #39) — full-screen unlock shown on every fresh app open,
// BEFORE the app content mounts. Primary: device biometric (Face ID /
// fingerprint) via the WebAuthn platform authenticator — prompted immediately
// on a cold open only (reload → password first; camera blocked → password only).
// Fallback: Supabase email + password.
// Agent: when Agent Access is ON — standing agent code (or planted fleet identity).
// In-session grace keeps mid-session reloads from re-prompting; a fresh launch re-locks.
//
// Password autofill (browser manager): username + password often land in the
// DOM after paint, while React state is still empty. We sync DOM → state, keep
// Unlock gray until both fields are ready, and auto-login once ready (or when
// Levi already tapped Unlock while it was still gray).
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  biometricSupported,
  biometricUnlock,
  clearUnlocked,
  getLastLoginEmail,
  hasEnrolledCredential,
  isSessionUnlocked,
  markAgentUnlocked,
  markUnlocked,
  mediaPermissionDenied,
  passwordUnlock,
  setLastLoginEmail,
  shouldAutoBiometric,
  touchUnlocked,
} from "../lib/lock.js";
import { saveSession } from "../lib/session.js";
import { getCompanyLogoSrc } from "../lib/appSettings.js";
import { productName, tenantName } from "../lib/tenantBranding.js";
import { DEMO, DEMO_CREDENTIALS } from "../lib/demoMode.js";
import { enterAsAgent, fetchAgentAccessStatus, getPlantedFleetIdentity } from "../lib/agentAccessClient.js";

// A pending native passkey prompt must never trap the user. If the device
// never answers (no platform authenticator, unenrolled, hung WebAuthn call),
// auto-abort and drop to the password view instead of spinning forever.
export const BIOMETRIC_TIMEOUT_MS = 25000;
/** How long we watch the inputs for browser password-manager autofill. */
export const AUTOFILL_WATCH_MS = 4000;
export const AUTOFILL_POLL_MS = 120;

function initialEmail() {
  if (DEMO) return DEMO_CREDENTIALS.email;
  return getLastLoginEmail() || "";
}

function initialPassword() {
  if (DEMO) return DEMO_CREDENTIALS.password;
  return "";
}

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
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  /** Agent Access toggle ON → show standing-code entry (unauth status GET). */
  const [agentAccessOn, setAgentAccessOn] = useState(false);
  const [agentCode, setAgentCode] = useState("");

  const enrolled = hasEnrolledCredential();
  const autoBioRan = useRef(false);
  const autoBioAllowed = useRef(false);
  // Controls the in-flight navigator.credentials.get()/create() call so a
  // fallback tap or the watchdog timeout can dismiss the native prompt.
  const abortRef = useRef(null);
  const bioTimerRef = useRef(null);
  const emailRef = useRef(null);
  const passRef = useRef(null);
  /** User tapped Unlock while fields were still empty/gray — login when ready. */
  const pendingUnlockRef = useRef(false);
  /** Auto-submit once when browser autofill fills both fields. */
  const autoLoginFiredRef = useRef(false);
  /** True once Levi typed in either field — do not auto-login mid-typing. */
  const userEditedRef = useRef(false);
  const runPasswordRef = useRef(null);

  const succeed = useCallback(() => {
    markUnlocked();
    setUnlocked(true);
  }, []);

  /** Live field values — prefer React state, fall back to DOM (browser autofill). */
  const readLiveCredentials = useCallback(() => {
    const domEmail = String(emailRef.current?.value || "").trim();
    const domPass = String(passRef.current?.value || "");
    const liveEmail = String(email || "").trim() || domEmail;
    const livePass = password || domPass;
    return { liveEmail, livePass };
  }, [email, password]);

  const credentialsReady = useCallback(() => {
    const { liveEmail, livePass } = readLiveCredentials();
    return Boolean(liveEmail && livePass);
  }, [readLiveCredentials]);

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
  // STOP must clear agent session AND unlock grace — otherwise a reload could re-open
  // the app for up to 8h on the leftover grace key after the agent session is dropped.
  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(async () => {
      if (!isSessionUnlocked()) {
        clearUnlocked();
        setUnlocked(false);
        return;
      }
      // If an agent UI session is active, re-check toggle (STOP / auto-off).
      try {
        const raw = globalThis.sessionStorage?.getItem("lepro_agent_session");
        if (!raw) return;
        const st = await fetchAgentAccessStatus();
        if (st.accessOn === false || st.state?.accessOn === false) {
          clearUnlocked();
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
      // Browser password managers often fill the DOM without firing React
      // onChange — always prefer live DOM values so the first Unlock works.
      const { liveEmail, livePass } = readLiveCredentials();
      if (!liveEmail || !livePass) {
        // Unlock still gray — remember the tap and login the moment fields fill.
        pendingUnlockRef.current = true;
        setErr("");
        return;
      }
      if (liveEmail !== email) setEmail(liveEmail);
      if (livePass !== password) setPassword(livePass);
      setErr("");
      setBusy(true);
      pendingUnlockRef.current = false;
      try {
        const session = await passwordUnlock(liveEmail, livePass);
        // Persist the Supabase session so data-plane requests carry the user's
        // token — the server resolves the tenant from it and isolates the store.
        saveSession(session);
        setLastLoginEmail(liveEmail);
        succeed();
      } catch (e2) {
        setErr(e2?.message || "Invalid email or password");
        // Allow another auto-try if the user fixes autofill / re-taps.
        autoLoginFiredRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [email, password, readLiveCredentials, succeed]
  );
  runPasswordRef.current = runPassword;

  // Sync browser password-manager autofill into React state, and auto-login
  // once both fields are ready (or after an early Unlock tap while still gray).
  // Deps are only unlocked/mode — setState from sync must NOT restart this
  // effect (that used to cancel the deferred auto-login).
  useEffect(() => {
    if (unlocked || mode !== "password") return;
    let cancelled = false;
    const started = Date.now();

    const syncFromDom = () => {
      if (cancelled) return false;
      const domEmail = String(emailRef.current?.value || "").trim();
      const domPass = String(passRef.current?.value || "");
      if (domEmail) setEmail((prev) => (prev === domEmail ? prev : domEmail));
      if (domPass) setPassword((prev) => (prev === domPass ? prev : domPass));
      const ready = Boolean(domEmail && domPass);
      if (!ready) return false;
      // Auto-login when:
      //  1) browser password manager filled both fields (no manual typing), or
      //  2) Levi already tapped Unlock while the button was still gray.
      // Demo stays "tap Unlock" (hint on screen). Never auto mid-typing.
      const fromAutofill = Boolean(domEmail && domPass && !userEditedRef.current && !DEMO);
      const shouldAuto = pendingUnlockRef.current || fromAutofill;
      if (!shouldAuto || autoLoginFiredRef.current) return true;
      autoLoginFiredRef.current = true;
      // Fire unlock even if this effect later cleans up — setState from sync
      // used to remount the effect and drop a gated Promise.
      queueMicrotask(() => {
        runPasswordRef.current?.();
      });
      return true;
    };

    // Chrome/Safari paint autofill asynchronously; poll briefly after mount.
    const iv = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - started > AUTOFILL_WATCH_MS) {
        clearInterval(iv);
        return;
      }
      syncFromDom();
    }, AUTOFILL_POLL_MS);

    // WebKit fires animationstart on autofilled inputs (chrome/safari).
    const onAnim = () => {
      syncFromDom();
    };
    // Form may not be mounted on the first paint of password mode — poll will
    // still catch autofill; bind animation listener on next tick when refs exist.
    const bindTimer = setTimeout(() => {
      const form = emailRef.current?.form || passRef.current?.form;
      form?.addEventListener?.("animationstart", onAnim, true);
      syncFromDom();
    }, 0);

    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(bindTimer);
      const form = emailRef.current?.form || passRef.current?.form;
      form?.removeEventListener?.("animationstart", onAnim, true);
    };
  }, [unlocked, mode]);

  /** Enter as agent — standing code (preferred) or planted fleet identity. */
  const runEnterAsAgent = useCallback(async () => {
    setErr("");
    setAgentBusy(true);
    abortBiometric();
    try {
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
      const code = String(agentCode || "").trim();
      const hasFleet = !!getPlantedFleetIdentity();
      if (!code && !hasFleet) {
        setErr("Enter the agent code from Settings → Agent Access.");
        return;
      }
      const session = await enterAsAgent({ unlockCode: code || undefined });
      markAgentUnlocked(session);
      setUnlocked(true);
    } catch (e2) {
      const code = e2?.code || "";
      if (code === "access_off") {
        setAgentAccessOn(false);
        setErr("agent access is off");
      } else if (code === "bad_code") {
        setErr("Wrong agent code.");
      } else if (code === "identity_missing" || code === "identity_fail") {
        setErr(e2?.message || "Enter the agent code from Settings.");
      } else {
        setErr(e2?.message || "Could not enter as agent");
      }
    } finally {
      setAgentBusy(false);
    }
  }, [abortBiometric, agentCode]);

  if (unlocked) return children;

  const agentEntryBlock = agentAccessOn ? (
    <div className="mt-3 w-full space-y-2" data-testid="lock-agent-entry">
      <input
        type="text"
        inputMode="text"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Agent code (LE-XXXX-XXXX)"
        value={agentCode}
        onChange={(e) => setAgentCode(e.target.value)}
        className="w-full rounded-xl px-4 py-3 text-base text-slate-900 outline-none font-mono tracking-wide"
        data-testid="lock-agent-code"
        disabled={agentBusy || busy}
      />
      <button
        type="button"
        onClick={() => {
          abortBiometric();
          runEnterAsAgent();
        }}
        disabled={agentBusy || busy}
        className="w-full rounded-xl bg-emerald-500/90 text-white font-extrabold px-4 py-3 text-base active:bg-emerald-500 disabled:opacity-50"
        data-testid="lock-enter-as-agent"
      >
        {agentBusy ? "Entering…" : "Enter as agent"}
      </button>
    </div>
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
            {agentEntryBlock}
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
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="username"
              name="username"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                userEditedRef.current = true;
                setEmail(e.target.value);
              }}
              className="w-full rounded-xl px-4 py-3.5 text-base text-slate-900 outline-none"
              data-testid="lock-email"
              required
            />
            <input
              ref={passRef}
              type="password"
              autoComplete="current-password"
              name="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                userEditedRef.current = true;
                setPassword(e.target.value);
              }}
              className="w-full rounded-xl px-4 py-3.5 text-base text-slate-900 outline-none"
              data-testid="lock-pass"
              required
            />
            {(() => {
              const ready = credentialsReady();
              // Gray until username+password are present; blue when ready to unlock.
              const unlockClass =
                ready && !busy
                  ? "w-full rounded-xl bg-sky-500 text-white font-extrabold px-4 py-3.5 text-base active:bg-sky-600"
                  : "w-full rounded-xl bg-white/35 text-white/70 font-extrabold px-4 py-3.5 text-base";
              return (
                <button
                  type="submit"
                  disabled={busy}
                  aria-disabled={!ready || busy}
                  data-ready={ready ? "1" : "0"}
                  className={unlockClass}
                  data-testid="lock-submit"
                  onClick={(e) => {
                    // Early tap while still gray (autofill not in yet): queue
                    // auto-login so a second tap is not required when it turns blue.
                    if (!credentialsReady()) {
                      e.preventDefault();
                      pendingUnlockRef.current = true;
                      setErr("");
                    }
                  }}
                >
                  {busy ? "Unlocking…" : "Unlock"}
                </button>
              );
            })()}
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
            {agentEntryBlock}
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
