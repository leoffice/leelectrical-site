// Keep focused text fields visible when the mobile keyboard opens.
// Instant (no smooth scroll) so typing never feels laggy.
//
// How it works:
// 1. On focusin of an input/textarea/select — scroll the field into its
//    nearest scroll parent and into the visual viewport.
// 2. On visualViewport resize/scroll (keyboard animation) — re-check the
//    active field so it stays in the remaining visible area.
// 3. Sets --vv-height / --kb-inset CSS vars so sheets can shrink to the
//    visible viewport instead of sitting under the keyboard.

const TEXT_SEL = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"]), textarea, select, [contenteditable="true"]';

let installed = false;
let raf = 0;
let lastVvH = 0;

function isTextField(el) {
  if (!el || el.nodeType !== 1) return false;
  try {
    return el.matches(TEXT_SEL);
  } catch {
    return false;
  }
}

function activeTextField() {
  if (typeof document === "undefined") return null;
  const el = document.activeElement;
  return isTextField(el) ? el : null;
}

function updateViewportVars() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) {
    root.style.setProperty("--vv-height", window.innerHeight + "px");
    root.style.setProperty("--kb-inset", "0px");
    return;
  }
  const h = Math.round(vv.height);
  const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  root.style.setProperty("--vv-height", h + "px");
  root.style.setProperty("--kb-inset", inset + "px");
  lastVvH = h;
}

/** Scroll field into its overflow parent (sheet body) without smooth animation. */
function scrollParentsToReveal(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return;
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(node) : null;
    const oy = style ? style.overflowY : "";
    const scrollable =
      (oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 2;
    if (scrollable) {
      const parentRect = node.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const pad = 16;
      if (elRect.top < parentRect.top + pad) {
        node.scrollTop -= parentRect.top + pad - elRect.top;
      } else if (elRect.bottom > parentRect.bottom - pad) {
        node.scrollTop += elRect.bottom - (parentRect.bottom - pad);
      }
    }
    node = node.parentElement;
  }
}

/** Keep field inside the visual viewport (keyboard-safe). */
function scrollIntoVisualViewport(el) {
  if (!el || typeof window === "undefined") return;
  const vv = window.visualViewport;
  const rect = el.getBoundingClientRect();
  const top = vv ? vv.offsetTop : 0;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const pad = 12;
  if (rect.top >= top + pad && rect.bottom <= bottom - pad) return;

  // Prefer instant scrollIntoView; falls back to parent scrolling above.
  try {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  } catch {
    try {
      el.scrollIntoView(true);
    } catch {
      /* jsdom / old browsers */
    }
  }
}

function ensureVisible(el) {
  if (!el) return;
  updateViewportVars();
  scrollParentsToReveal(el);
  scrollIntoVisualViewport(el);
  // One more pass after layout settles (keyboard still animating on iOS).
  scrollParentsToReveal(el);
  scrollIntoVisualViewport(el);
}

function scheduleEnsure(el) {
  if (typeof window === "undefined") return;
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = 0;
    ensureVisible(el || activeTextField());
  });
}

function onFocusIn(e) {
  const t = e && e.target;
  if (!isTextField(t)) return;
  // Immediate + one frame later (keyboard may open after focus).
  ensureVisible(t);
  scheduleEnsure(t);
  // iOS often finishes keyboard open ~250–350ms after focus — one short delayed
  // pass only, no polling loop (avoids lag / jank while typing).
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (document.activeElement === t) ensureVisible(t);
    }, 280);
  }
}

function onViewportChange() {
  updateViewportVars();
  const el = activeTextField();
  if (!el) return;
  // Only re-scroll when height actually changed (keyboard open/close), not
  // every visualViewport scroll tick while the user pans.
  const vv = window.visualViewport;
  const h = vv ? Math.round(vv.height) : window.innerHeight;
  if (Math.abs(h - lastVvH) < 8 && lastVvH > 0) return;
  scheduleEnsure(el);
}

/**
 * Install once for the app. Safe to call multiple times.
 * @returns {() => void} uninstall
 */
export function installKeepFocusedVisible() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (installed) return () => {};
  installed = true;
  updateViewportVars();
  document.addEventListener("focusin", onFocusIn, true);
  window.addEventListener("resize", onViewportChange, { passive: true });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", onViewportChange, { passive: true });
    vv.addEventListener("scroll", onViewportChange, { passive: true });
  }
  return () => {
    if (!installed) return;
    installed = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener("focusin", onFocusIn, true);
    window.removeEventListener("resize", onViewportChange);
    if (vv) {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
    }
  };
}

/** Test helpers */
export function __isTextField(el) {
  return isTextField(el);
}

export function __ensureVisible(el) {
  ensureVisible(el);
}

export function __resetKeepFocusedVisible() {
  installed = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastVvH = 0;
}
