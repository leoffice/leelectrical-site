// Desktop shell layout — collapsible/resizable sidebar + list pane.
// Widths persist so Levi's preferred split stays across reloads.

export const SIDEBAR_LS = "le.desktop.sidebar";
export const LIST_LS = "le.desktop.listPane";

export const SIDEBAR_EXPANDED = 256;
export const SIDEBAR_COLLAPSED = 72;
export const SIDEBAR_MIN = 72;
export const SIDEBAR_MAX = 320;

export const LIST_DEFAULT = 360;
export const LIST_MIN = 72;
export const LIST_MAX = 520;
/** Below this width the customer list shows compact (avatar-first) cards. */
export const LIST_COMPACT_AT = 160;

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function loadSidebarLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(SIDEBAR_LS) || "{}");
    return {
      width: clamp(raw.width ?? SIDEBAR_EXPANDED, SIDEBAR_MIN, SIDEBAR_MAX),
      collapsed: !!raw.collapsed,
    };
  } catch {
    return { width: SIDEBAR_EXPANDED, collapsed: false };
  }
}

export function saveSidebarLayout(state) {
  try {
    localStorage.setItem(
      SIDEBAR_LS,
      JSON.stringify({
        width: clamp(state.width, SIDEBAR_MIN, SIDEBAR_MAX),
        collapsed: !!state.collapsed,
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function effectiveSidebarWidth(state) {
  if (!state) return SIDEBAR_EXPANDED;
  if (state.collapsed) return SIDEBAR_COLLAPSED;
  return clamp(state.width, SIDEBAR_MIN, SIDEBAR_MAX);
}

/** True when sidebar is icon-only (collapsed or dragged to min). */
export function sidebarIconOnly(state) {
  if (!state) return false;
  if (state.collapsed) return true;
  return effectiveSidebarWidth(state) <= SIDEBAR_COLLAPSED + 8;
}

export function loadListPaneLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_LS) || "{}");
    return {
      width: clamp(raw.width ?? LIST_DEFAULT, LIST_MIN, LIST_MAX),
      collapsed: !!raw.collapsed,
    };
  } catch {
    return { width: LIST_DEFAULT, collapsed: false };
  }
}

export function saveListPaneLayout(state) {
  try {
    localStorage.setItem(
      LIST_LS,
      JSON.stringify({
        width: clamp(state.width, LIST_MIN, LIST_MAX),
        collapsed: !!state.collapsed,
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function effectiveListWidth(state) {
  if (!state) return LIST_DEFAULT;
  if (state.collapsed) return LIST_MIN;
  return clamp(state.width, LIST_MIN, LIST_MAX);
}

export function listPaneCompact(state) {
  return effectiveListWidth(state) <= LIST_COMPACT_AT;
}

/** Apply sidebar width as a CSS variable for fixed chrome (save bar, etc.). */
export function applySidebarCssVar(px) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--desktop-sidebar-w", `${Math.round(px)}px`);
}
