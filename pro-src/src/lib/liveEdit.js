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
  }
  for (const h of highlights) {
    if (h.text) lines.push(`Highlight (${h.scope}): "${h.excerpt}" — ${h.text}`);
  }
  return lines.join("\n");
}

export function hasPendingWork(pending, sessionHighlights = []) {
  return Object.keys(pending || {}).length > 0 || sessionHighlights.length > 0;
}