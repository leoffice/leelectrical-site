import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import App from "./App.jsx";
import LockGate from "./components/LockGate.jsx";
import PayLanding from "./views/PayLanding.jsx";
import PayThanks from "./views/PayThanks.jsx";
import { StoreProvider } from "./state/store.jsx";
import { TenantProvider } from "./state/tenant.jsx";
import "./index.css";
import { checkForAppUpdate, watchServiceWorkerUpdates, watchForegroundUpdates } from "./lib/appUpdate.js";
import { DEMO } from "./lib/demoMode.js";
import { installDemoBackend } from "./demo/demoBackend.js";
import { installKeepFocusedVisible } from "./lib/keepFocusedVisible.js";
import { buildPhaseACtaPayPayload, renewScenarioById } from "./lib/permitRenewal.js";
import { encodePayLanding } from "./lib/payLanding.js";
import { markPlaceholderMaterialized } from "./lib/permitCache.js";

// DEMO / white-label TEST TENANT: intercept every backend call and serve a
// synthetic, isolated store BEFORE any provider mounts or any fetch fires.
// This is what guarantees a demo build can never reach real production data.
if (DEMO) installDemoBackend();

// Mobile keyboard: keep the focused email/message field on screen (no lag).
installKeepFocusedVisible();

/**
 * Bootstrap public pay route from ?pay=CODE (survives 302 Location headers).
 * Email "View invoice" links redirect here so hash is not lost mid-redirect
 * (Levi 2026-08-05 — blank page / LockGate when #fragment is dropped).
 *
 * Use location.replace (not only history.replaceState) so HashRouter never
 * boots once on "/" (staff lock) before the hash is applied.
 */
function bootstrapPayQueryToHash() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    const code = String(u.searchParams.get("pay") || u.searchParams.get("t") || "").trim();
    if (!code) return;
    const enc = encodeURIComponent(code);
    const wantHash = `#/pay/${enc}`;
    const hash = String(u.hash || "");
    const already =
      hash === wantHash ||
      hash === `#/pay/${code}` ||
      hash.startsWith(`#/pay/${enc}`) ||
      hash.startsWith(`#/pay/${code}`);
    u.searchParams.delete("pay");
    u.searchParams.delete("t");
    const qs = u.searchParams.toString();
    const base = `${u.pathname}${qs ? `?${qs}` : ""}`;
    if (already) {
      // Drop query only — stay on pay route.
      const clean = `${base}${hash.startsWith("#") ? hash : wantHash}`;
      if (clean !== `${u.pathname}${u.search}${u.hash}`) {
        window.history.replaceState(null, "", clean);
      }
      return;
    }
    // Hard navigation into the public pay route (no LockGate flash).
    window.location.replace(`${base}${wantHash}`);
  } catch {
    /* ignore */
  }
}
bootstrapPayQueryToHash();

/**
 * Email "Renew Permit" CTA — public, no staff lock.
 * Builds the renew invoice pay landing only when the customer taps the button
 * (invoice is not generated when staff sends the notice email).
 * Query: ?renewCta=phaseA&scenario=hampton-yossi&inv=LE-####
 */
function bootstrapRenewCtaQueryToPay() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (String(u.searchParams.get("renewCta") || "").trim() !== "phaseA") return;
    // Brief "Loading invoice" shell while we build the pay token (Levi 2026-08-10)
    try {
      const root = document.getElementById("root");
      if (root && !root.dataset.renewCtaLoading) {
        root.dataset.renewCtaLoading = "1";
        root.innerHTML =
          '<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc">' +
          '<div style="text-align:center;padding:2rem">' +
          '<div style="width:2.25rem;height:2.25rem;border:3px solid #c4b5fd;border-top-color:#6d28d9;border-radius:50%;margin:0 auto 1rem;animation:spin .7s linear infinite"></div>' +
          '<div style="font-weight:800;font-size:1.05rem;color:#0f172a">Loading invoice…</div>' +
          '<div style="font-size:0.8rem;color:#64748b;margin-top:0.35rem">Opening your renew payment page</div>' +
          "</div></div>" +
          "<style>@keyframes spin{to{transform:rotate(360deg)}}</style>";
      }
    } catch {
      /* ignore */
    }
    const scenarioId = String(u.searchParams.get("scenario") || "").trim();
    const inv = String(u.searchParams.get("inv") || "").trim();
    const sc = renewScenarioById(scenarioId);
    const payload = buildPhaseACtaPayPayload({
      scenario: sc,
      invoiceNo: inv,
    });
    if (inv) markPlaceholderMaterialized(inv);
    const token = encodePayLanding(payload);
    if (!token) return;
    u.searchParams.delete("renewCta");
    u.searchParams.delete("scenario");
    u.searchParams.delete("inv");
    const qs = u.searchParams.toString();
    const base = `${u.pathname}${qs ? `?${qs}` : ""}`;
    window.location.replace(`${base}#/pay/${token}`);
  } catch {
    /* ignore */
  }
}
bootstrapRenewCtaQueryToPay();

/** Public customer pay page — no biometric/password gate. */
function PayOrApp() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/pay")) {
    return (
      <Routes>
        <Route path="/pay/thanks" element={<PayThanks />} />
        <Route path="/pay/:token" element={<PayLanding />} />
        <Route path="/pay" element={<PayLanding />} />
      </Routes>
    );
  }
  return (
    <LockGate>
      <StoreProvider>
        {/* Loads tenant_config before App mounts, so disabled routes are
            never registered — not even for a frame. */}
        <TenantProvider>
          <App />
        </TenantProvider>
      </StoreProvider>
    </LockGate>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <PayOrApp />
    </HashRouter>
  </React.StrictMode>
);

// PWA: register the service worker (cache-first assets, offline shell).
// Skipped in demo mode — a shared demo URL should not install a SW or cache a
// stale shell, and the demo has no offline story to keep.
if (!DEMO && "serviceWorker" in navigator && !location.hostname.includes("localhost")) {
  watchServiceWorkerUpdates();
  // Long-open PWAs only fire `load` once; also re-check when refocused so a new
  // deploy reaches the device without a full relaunch.
  watchForegroundUpdates();
  window.addEventListener("load", () => {
    checkForAppUpdate();
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
