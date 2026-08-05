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

// DEMO / white-label TEST TENANT: intercept every backend call and serve a
// synthetic, isolated store BEFORE any provider mounts or any fetch fires.
// This is what guarantees a demo build can never reach real production data.
if (DEMO) installDemoBackend();

// Mobile keyboard: keep the focused email/message field on screen (no lag).
installKeepFocusedVisible();

/**
 * Bootstrap public pay route from ?pay=CODE (survives 302 Location headers).
 * Email "View invoice" links redirect here so hash is not lost mid-redirect
 * (Levi 2026-08-05 — blank page after receipt CTA).
 */
function bootstrapPayQueryToHash() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    const code = String(u.searchParams.get("pay") || u.searchParams.get("t") || "").trim();
    if (!code) return;
    // Already on the hash pay route with this token — just strip query.
    const hash = String(u.hash || "");
    if (hash.includes(`/pay/${code}`) || hash.includes(`/pay/${encodeURIComponent(code)}`)) {
      u.searchParams.delete("pay");
      u.searchParams.delete("t");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      return;
    }
    u.searchParams.delete("pay");
    u.searchParams.delete("t");
    const qs = u.searchParams.toString();
    const next = `${u.pathname}${qs ? `?${qs}` : ""}#/pay/${encodeURIComponent(code)}`;
    window.history.replaceState(null, "", next);
  } catch {
    /* ignore */
  }
}
bootstrapPayQueryToHash();

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
