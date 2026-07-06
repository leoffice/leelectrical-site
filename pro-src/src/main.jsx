import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import LockGate from "./components/LockGate.jsx";
import { StoreProvider } from "./state/store.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      {/* Unlock gate — must clear before the app (and its data fetching) mounts. */}
      <LockGate>
        <StoreProvider>
          <App />
        </StoreProvider>
      </LockGate>
    </HashRouter>
  </React.StrictMode>
);

// PWA: register the service worker (cache-first assets, offline shell).
if ("serviceWorker" in navigator && !location.hostname.includes("localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
