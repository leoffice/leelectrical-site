// Staff lock shell — LockGate only. The store/App graph lives in StaffAppBody
// and loads after unlock (or in parallel while the password screen is up).
// Perf Batch E (2026-09-01): first login was waiting on the full ~1 MB staff
// chunk before the lock screen could paint.
import React, { Suspense, useEffect } from "react";
import LockGate from "./components/LockGate.jsx";

const StaffAppBody = React.lazy(() => import("./StaffAppBody.jsx"));

const BodyFallback = (
  <div
    className="min-h-screen flex items-center justify-center text-sm font-semibold text-slate-400"
    data-testid="staff-body-boot"
  >
    Loading…
  </div>
);

/** Kick off the heavy chunk + jobs warm as soon as the lock screen is up. */
function prefetchStaffBody() {
  import("./StaffAppBody.jsx")
    .then(() => import("./lib/jobsBootWarm.js"))
    .then((m) => m.startJobsBootWarm?.())
    .catch(() => {});
}

export default function StaffApp() {
  useEffect(() => {
    // Prefer idle time so Face ID / password paint first; fall back to a tick.
    const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
    if (ric) {
      const id = ric(() => prefetchStaffBody(), { timeout: 1200 });
      return () => {
        if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
      };
    }
    const t = setTimeout(prefetchStaffBody, 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <LockGate>
      <Suspense fallback={BodyFallback}>
        <StaffAppBody />
      </Suspense>
    </LockGate>
  );
}
