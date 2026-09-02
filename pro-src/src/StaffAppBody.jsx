// Heavy staff graph — store, tenant gate, and the full App shell.
// Loaded lazily AFTER LockGate so the password / Face ID screen is not
// blocked on the ~1 MB staff chunk (perf Batch E, first-login snappy).
import React from "react";
import App from "./App.jsx";
import { StoreProvider } from "./state/store.jsx";
import { TenantProvider } from "./state/tenant.jsx";

export default function StaffAppBody() {
  return (
    <StoreProvider>
      {/* Loads tenant_config before App mounts, so disabled routes are
          never registered — not even for a frame. */}
      <TenantProvider>
        <App />
      </TenantProvider>
    </StoreProvider>
  );
}
