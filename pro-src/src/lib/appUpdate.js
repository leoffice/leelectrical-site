/** Force installed PWAs/APKs to pick up a new deploy — clears stale cached UI. */
const VERSION_KEY = "le-pro-live-sha";
const LOOP_GUARD_KEY = "le-pro-update-reload-ts";
const LOOP_GUARD_MS = 30_000;

async function clearAppCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("le-pro-")).map((k) => caches.delete(k)));
  }
  // Nudge the waiting worker — full SW unregister on iOS PWAs can crash on reload.
  if ("serviceWorker" in navigator) {
    try {
      const base = import.meta.env.BASE_URL || "/";
      const reg = await navigator.serviceWorker.getRegistration(base + "sw.js");
      if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    } catch {
      /* SW unavailable */
    }
  }
}

/** Compare LIVE version.json to last-seen; reload once when the server moved on. */
export async function checkForAppUpdate() {
  if (typeof window === "undefined" || location.hostname.includes("localhost")) return;
  if (location.pathname.includes("/pay")) return;

  try {
    const base = import.meta.env.BASE_URL || "/";
    const res = await fetch(`${base}version.json?cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;

    const data = await res.json();
    const liveSha = String(data.gitShaShort || data.gitSha || "").trim().slice(0, 7);
    if (!liveSha) return;

    const prev = localStorage.getItem(VERSION_KEY);
    if (prev && prev !== liveSha) {
      const lastReload = Number(sessionStorage.getItem(LOOP_GUARD_KEY) || 0);
      if (lastReload && Date.now() - lastReload < LOOP_GUARD_MS) {
        localStorage.setItem(VERSION_KEY, liveSha);
        return;
      }
      sessionStorage.setItem(LOOP_GUARD_KEY, String(Date.now()));
      await clearAppCaches();
      localStorage.setItem(VERSION_KEY, liveSha);
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(LOOP_GUARD_KEY);
    localStorage.setItem(VERSION_KEY, liveSha);
  } catch {
    /* offline or blocked — keep running with cached shell */
  }
}

/**
 * Re-check for a new deploy when a long-open PWA returns to the foreground.
 * Installed PWAs/APKs often stay open for days and only fire `load` once, so the
 * load-time check in main.jsx never re-runs — a deploy then never reaches the
 * device until it is fully relaunched. Re-checking on visibility/focus closes
 * that gap. Throttled so quick tab switches don't hammer the network, and the
 * reload itself is still guarded by checkForAppUpdate's loop guard.
 */
const FOREGROUND_CHECK_THROTTLE_MS = 60_000;

/** The throttled, visibility-gated handler — pure and self-contained for tests. */
export function makeForegroundUpdateHandler(now = () => Date.now(), check = checkForAppUpdate) {
  let last = 0;
  return () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const t = now();
    if (last && t - last < FOREGROUND_CHECK_THROTTLE_MS) return;
    last = t;
    check();
  };
}

export function watchForegroundUpdates(now = () => Date.now()) {
  if (typeof document === "undefined" || location.hostname.includes("localhost")) return;
  const onForeground = makeForegroundUpdateHandler(now);
  document.addEventListener("visibilitychange", onForeground);
  window.addEventListener("focus", onForeground);
}

/** Reload when a waiting service worker takes control (post-deploy SW bump). */
export function watchServiceWorkerUpdates() {
  if (!("serviceWorker" in navigator) || location.hostname.includes("localhost")) return;

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready
    .then((reg) => {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller && reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch(() => {});
}