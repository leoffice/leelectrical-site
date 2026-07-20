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
if ("serviceWorker" in navigator && !location.hostname.includes("localhost")) {
  watchServiceWorkerUpdates();
  // Long-open PWAs only fire `load` once; also re-check when refocused so a new
  // deploy reaches the device without a full relaunch.
  watchForegroundUpdates();
  window.addEventListener("load", () => {
    checkForAppUpdate();
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
