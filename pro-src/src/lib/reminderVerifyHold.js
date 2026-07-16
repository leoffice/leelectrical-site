// Brief hold while a reminder is being verified (hides popup/list row).
export const VERIFY_HOLD_KEY = "lepro_reminder_verify_hold";
/** Default hold while a quick verify runs — then clear or re-show. */
export const VERIFY_HOLD_MS = 10_000;

function loadHolds() {
  try {
    const raw = localStorage.getItem(VERIFY_HOLD_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveHolds(state) {
  try {
    localStorage.setItem(VERIFY_HOLD_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}

/** Stable key for a list/popup reminder item. */
export function reminderItemKey(item) {
  if (!item) return "";
  if (item.id) return String(item.id);
  if (item.kind === "unsent_doc" && item.job?.id) {
    return "unsent:" + item.job.id + ":" + (item.docKind || "invoice");
  }
  if (item.event?.id) return (item.kind || "ev") + ":" + item.event.id;
  return "";
}

/** Hide this reminder for ~10s while verify runs (or until explicitly released). */
export function beginVerifyHold(itemKey, now = Date.now(), ms = VERIFY_HOLD_MS) {
  const key = String(itemKey || "");
  if (!key) return null;
  const holds = loadHolds();
  const until = now + Math.max(1000, Number(ms) || VERIFY_HOLD_MS);
  holds[key] = until;
  for (const k of Object.keys(holds)) {
    if (Number(holds[k]) <= now - 60_000) delete holds[k];
  }
  saveHolds(holds);
  return until;
}

export function clearVerifyHold(itemKey) {
  const key = String(itemKey || "");
  if (!key) return;
  const holds = loadHolds();
  if (!(key in holds)) return;
  delete holds[key];
  saveHolds(holds);
}

export function isVerifyHeld(itemKey, now = Date.now()) {
  const key = String(itemKey || "");
  if (!key) return false;
  const until = Number(loadHolds()[key] || 0);
  return until > now;
}

/** Filter list/queue items currently under verify hold. */
export function filterVerifyHeld(items, now = Date.now()) {
  return (items || []).filter((item) => !isVerifyHeld(reminderItemKey(item), now));
}

export function __resetVerifyHoldsForTests() {
  try {
    localStorage.removeItem(VERIFY_HOLD_KEY);
  } catch {
    /* ignore */
  }
}
