// Staff app shell — the ENTIRE staff dependency graph (store, adapter, views,
// sheets) hangs off this module, and main.jsx loads it lazily. A customer
// opening an emailed /pay link never downloads it (perf Batch D, 2026-08-11).
import React from "react";
import App from "./App.jsx";
import LockGate from "./components/LockGate.jsx";
import { StoreProvider } from "./state/store.jsx";
import { TenantProvider } from "./state/tenant.jsx";

export default function StaffApp() {
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
