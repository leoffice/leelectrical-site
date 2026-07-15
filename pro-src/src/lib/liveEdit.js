// Live UI edits — long-press hide/relabel/suggest; persist locally + sync to dev board.

const STORAGE_KEY = "lepro_ui_edits";
const HIGHLIGHTS_KEY = "lepro_ui_highlights";

export function makeEditKey(scope, id) {
  return `${scope}::${id}`;
}

export function loadSavedEdits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSavedEdits(edits) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    /* ignore quota */
  }
}

export function loadHighlights() {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHighlights(items) {
  try {
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function getEdit(edits, key) {
  return (edits && edits[key]) || {};
}

export function isHidden(edits, key) {
  return !!getEdit(edits, key).hidden;
}

export function effectiveLabel(edits, key, fallback) {
  const label = getEdit(edits, key).label;
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

/** Merge pending into saved and return the new saved map. */
export function mergeEdits(saved, pending) {
  const next = { ...saved };
  for (const [key, patch] of Object.entries(pending || {})) {
    if (!patch || patch._delete) {
      delete next[key];
      continue;
    }
    next[key] = { ...(next[key] || {}), ...patch };
  }
  return next;
}

/** Build a dev-board description from pending changes. */
export function formatSyncDescription(pending, highlights = []) {
  const lines = [];
  for (const [key, patch] of Object.entries(pending || {})) {
    if (patch.hidden) lines.push(`Hide: ${key}`);
    if (patch.label) lines.push(`Rename ${key} → "${patch.label}"`);
    if (patch.suggestion) lines.push(`Suggest (${key}): ${patch.suggestion}`);
    if (patch.style) {
      const bits = Object.entries(patch.style)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`);
      if (bits.length) lines.push(`Style (${key}): ${bits.join(", ")}`);
    }
  }
  for (const h of highlights) {
    if (h.rect && h.text) {
      const r = h.rect;
      lines.push(`Area (${h.scope}): ${h.text} [${Math.round(r.width)}×${Math.round(r.height)}px]`);
    } else if (h.text) {
      lines.push(`Highlight (${h.scope}): "${h.excerpt || "area"}" — ${h.text}`);
    }
  }
  return lines.join("\n");
}

/** Scope string from a pathname for edit keys. */
export function scopeFromPath(pathname) {
  return (pathname || "/").replace(/\//g, ":").replace(/^:/, "") || "root";
}

/** Auto key for an element without data-live-edit-key. */
export function autoEditKey(el, pathname) {
  if (!el) return "";
  const existing = el.dataset?.liveEditKey;
  if (existing) return existing;
  const scope = scopeFromPath(pathname);
  const testId = el.dataset?.testid;
  if (testId) return makeEditKey(scope, testId);
  const label = String(el.textContent || "")
    .trim()
    .slice(0, 48)
    .replace(/\s+/g, "-")
    .toLowerCase();
  return makeEditKey(scope, label || "element");
}

const EDITABLE_SEL = "button, a[href], [role='button'], .btn, .btn-brand";

/** Escape a key for use in a [data-live-edit-key="…"] selector. */
export function editKeyAttr(key) {
  return String(key).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** CSS rules for saved element styles and hidden state. */
export function buildStyleRules(edits) {
  return Object.entries(edits || {})
    .filter(([, v]) => {
      if (!v) return false;
      if (v.hidden) return true;
      return v.style && Object.keys(v.style).length > 0;
    })
    .map(([key, v]) => {
      const decl = [];
      if (v.hidden) decl.push("display: none !important");
      const s = v.style || {};
      if (s.fontSize) decl.push(`font-size: ${s.fontSize}`);
      if (s.color) decl.push(`color: ${s.color}`);
      if (s.backgroundColor) decl.push(`background-color: ${s.backgroundColor}`);
      if (s.width) decl.push(`width: ${s.width}`);
      if (s.height) decl.push(`height: ${s.height}`);
      if (s.minHeight) decl.push(`min-height: ${s.minHeight}`);
      if (!decl.length) return "";
      return `[data-live-edit-key="${editKeyAttr(key)}"] { ${decl.join("; ")} }`;
    })
    .filter(Boolean)
    .join("\n");
}

function isEditableCandidate(el) {
  if (!el?.matches) return false;
  const text = (el.textContent || "").trim();
  return text.length > 0 && text.length < 240;
}

/** Tag editable controls with stable keys so saved edits can target them. */
export function tagEditableElements(pathname) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(EDITABLE_SEL).forEach((el) => {
    if (!isEditableCandidate(el)) return;
    const key = autoEditKey(el, pathname);
    if (key) el.dataset.liveEditKey = key;
  });
}

function storeOriginalLabel(el) {
  if (el.dataset.liveEditOrig != null) return el.dataset.liveEditOrig;
  const orig = (el.textContent || "").trim().replace(/\s+/g, " ");
  el.dataset.liveEditOrig = orig;
  return orig;
}

/** Apply or restore a relabel on a single element. */
export function applyLabelToElement(el, label, active) {
  if (!el) return;
  if (!active) {
    const orig = el.dataset.liveEditOrig;
    if (orig != null) el.textContent = orig;
    return;
  }
  const orig = storeOriginalLabel(el);
  const m = orig.match(/^(\p{Extended_Pictographic}|\S{1,3})\s+/u);
  const prefix = m && orig.slice(m[0].length).trim() ? m[0] : "";
  el.textContent = prefix ? prefix + label : label;
}

/** Apply relabels from merged edits onto the live DOM. */
export function applyDomLabels(pathname, edits) {
  if (typeof document === "undefined") return;
  tagEditableElements(pathname);
  const touched = new Set();
  document.querySelectorAll("[data-live-edit-key]").forEach((el) => {
    const key = el.dataset.liveEditKey;
    if (!key || touched.has(key)) return;
    touched.add(key);
    const patch = getEdit(edits, key);
    if (patch.label) applyLabelToElement(el, patch.label, true);
    else applyLabelToElement(el, "", false);
  });
}

export function hasPendingWork(pending, sessionHighlights = []) {
  return Object.keys(pending || {}).length > 0 || sessionHighlights.length > 0;
}