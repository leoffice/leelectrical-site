// Global press feedback — brief color flash + haptic so every tap feels registered
// (Levi 2026-09-01). iOS Safari often skips vibrate; the flash still fires.

const FLASH_MS = 160;
const HAPTIC_MS = 12;

export function hapticTap(ms = HAPTIC_MS) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

export function flashEl(el) {
  if (!el || !el.classList) return;
  el.classList.add("le-press-flash");
  window.setTimeout(() => {
    try {
      el.classList.remove("le-press-flash");
    } catch {
      /* ignore */
    }
  }, FLASH_MS);
}

function isPressable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.disabled || el.getAttribute?.("aria-disabled") === "true") return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "button" || tag === "summary") return true;
  if (el.getAttribute?.("role") === "button") return true;
  if (el.classList?.contains("btn") || el.classList?.contains("chip")) return true;
  if (tag === "a" && (el.classList?.contains("btn") || el.getAttribute?.("href"))) return true;
  return false;
}

/** Capture-phase listener — one install per page. */
export function installGlobalTapFeedback() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.__leTapFeedbackInstalled) return;
  window.__leTapFeedbackInstalled = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button != null && e.button !== 0) return;
      const t = e.target?.closest?.(
        'button, [role="button"], a.btn, .btn, .chip, summary, [data-tap-feedback]'
      );
      if (!isPressable(t)) return;
      hapticTap();
      flashEl(t);
    },
    { capture: true, passive: true }
  );
}
