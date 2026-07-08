import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import App from "./App.jsx";
import LockGate from "./components/LockGate.jsx";
import PayLanding from "./views/PayLanding.jsx";
import { StoreProvider } from "./state/store.jsx";
import "./index.css";

/** Public customer pay page — no biometric/password gate. */
function PayOrApp() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/pay")) {
    return (
      <Routes>
        <Route path="/pay/:token" element={<PayLanding />} />
      </Routes>
    );
  }
  return (
    <LockGate>
      <StoreProvider>
        <App />
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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
