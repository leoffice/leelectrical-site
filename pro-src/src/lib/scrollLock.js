// Body scroll lock for open sheets.
//
// Without this the page behind a sheet still scrolls (scroll chaining from the
// sheet body, or a stray wheel/touch on the dimmer). When the sheet closes the
// page is no longer where the user left it, so rows land under the cursor in
// different places — the "layout reflows after a modal closes" report, which
// is how a stray click hit the wrong control.
//
// Refcounted so nested/stacked sheets unlock exactly once, and the release is
// idempotent for React 18 StrictMode double-invoked effects.

let depth = 0;
let savedY = 0;
let savedOverflow = "";

function currentY() {
  if (typeof window === "undefined") return 0;
  return window.scrollY || window.pageYOffset || 0;
}

/** Lock body scrolling. Returns an idempotent release that restores position. */
export function lockBodyScroll() {
  if (typeof document === "undefined" || !document.body) return () => {};
  depth += 1;
  if (depth === 1) {
    savedY = currentY();
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth !== 0) return;
    document.body.style.overflow = savedOverflow;
    // Only correct the position if it actually drifted — avoids a pointless
    // scrollTo (and its jsdom noise) in the common case.
    if (currentY() !== savedY && typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo(0, savedY);
      } catch {
        /* scrollTo unavailable (jsdom) */
      }
    }
  };
}

export function scrollLockDepth() {
  return depth;
}

export function lockedScrollY() {
  return savedY;
}

/** Test-only: clear lock state between cases. */
export function __resetScrollLock() {
  depth = 0;
  savedY = 0;
  savedOverflow = "";
  if (typeof document !== "undefined" && document.body) document.body.style.overflow = "";
}
