// Global open-sheet registry.
//
// Auto-opening prompts (reminders, "Same customer?", email insights) used to
// decide independently whether to show themselves, so two could mount at once.
// Every Sheet is `fixed inset-0 z-[60]` with a full-screen dimmer, so a stack
// meant the lower sheet's buttons were unreachable — clicks hit the top dimmer.
//
// Sheet.jsx registers itself while mounted; prompts consult the SAME guard
// before opening, and can subscribe so they open as soon as the screen clears
// (no polling, no DOM sniffing).
//
// React-free so it is unit-testable in the vitest "node" environment.

let openCount = 0;
const listeners = new Set();

function notify() {
  // Copy first: a listener may unsubscribe during notification.
  for (const fn of [...listeners]) {
    try {
      fn(openCount);
    } catch {
      /* a throwing listener must not stop the others */
    }
  }
}

/**
 * Register an open sheet. Returns an idempotent unregister — safe to call
 * twice (React 18 StrictMode double-invokes effects).
 */
export function registerSheet() {
  openCount += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    notify();
  };
}

export function openSheetCount() {
  return openCount;
}

export function anySheetOpen() {
  return openCount > 0;
}

/** Subscribe to open/close changes. Returns an unsubscribe. */
export function subscribeSheets(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * True when the screen is already covered by a sheet/modal.
 * Checks the registry first, then falls back to the DOM marker so any overlay
 * that renders `data-sheet` without going through Sheet.jsx still counts —
 * this is strictly no weaker than the old DOM-only check.
 */
export function isScreenCovered() {
  if (anySheetOpen()) return true;
  if (typeof document === "undefined") return false;
  return !!document.querySelector("[data-sheet]");
}

/** Test-only: clear registry state between cases. */
export function __resetSheetRegistry() {
  openCount = 0;
  listeners.clear();
}
