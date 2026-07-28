/**
 * Board-wide "X means remind me later".
 *
 * Every suggestion popup in the app (reminders, unsent docs, incoming payments,
 * email insights, sync issues) used to treat its ✕ as "gone". Levi 2026-07-27:
 * closing a suggestion is never a decision to drop it — it's "not now". So the
 * ✕ opens a 5-minute-to-5-hour picker and the card comes back when it expires.
 *
 * Surfaces that already own a snooze store (calendar reminders, unsent docs)
 * keep using theirs; this module is the fallback for everything else, keyed by
 * a caller-chosen string.
 */

export const DISMISS_SNOOZE_KEY = "lepro_dismiss_snooze";

/** Slider bounds, in minutes — 5 minutes through 5 hours. */
export const DISMISS_SNOOZE_MIN = 5;
export const DISMISS_SNOOZE_MAX = 300;
export const DISMISS_SNOOZE_STEP = 5;
export const DISMISS_SNOOZE_DEFAULT = 60;

/** Taps for the common choices; the slider covers everything between. */
export const DISMISS_SNOOZE_PRESETS = [
  { minutes: 5, label: "5 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 300, label: "5 hours" },
];

/** Clamp any input to the slider's range. */
export function clampSnoozeMinutes(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (!Number.isFinite(m)) return DISMISS_SNOOZE_DEFAULT;
  return Math.min(DISMISS_SNOOZE_MAX, Math.max(DISMISS_SNOOZE_MIN, m));
}

/** "5 min" · "45 min" · "1 hour" · "2½ hours" */
export function formatSnoozeMinutes(minutes) {
  const m = clampSnoozeMinutes(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!r) return h === 1 ? "1 hour" : `${h} hours`;
  const half = r === 30 ? "½" : `:${String(r).padStart(2, "0")}`;
  return `${h}${half} hours`;
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readMap() {
  const ls = storage();
  if (!ls) return {};
  try {
    const raw = JSON.parse(ls.getItem(DISMISS_SNOOZE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(DISMISS_SNOOZE_KEY, JSON.stringify(map));
  } catch {
    /* quota — a lost snooze just means the card returns sooner */
  }
}

/**
 * Hide `key` for `minutes`. Returns the ISO instant it comes back.
 * @param {string} key stable id for the suggestion (e.g. "payment:abc123")
 */
export function snoozeSuggestion(key, minutes, now = new Date()) {
  if (!key) return "";
  const until = new Date(now.getTime() + clampSnoozeMinutes(minutes) * 60_000).toISOString();
  const map = readMap();
  map[String(key)] = until;
  writeMap(map);
  return until;
}

/** True while a snooze on `key` is still running. Expired entries are swept. */
export function isSuggestionSnoozed(key, now = new Date()) {
  if (!key) return false;
  const map = readMap();
  const until = map[String(key)];
  if (!until) return false;
  const ts = new Date(until).getTime();
  if (!Number.isFinite(ts)) return false;
  if (ts > now.getTime()) return true;
  delete map[String(key)];
  writeMap(map);
  return false;
}

export function clearSuggestionSnooze(key) {
  if (!key) return;
  const map = readMap();
  if (!(String(key) in map)) return;
  delete map[String(key)];
  writeMap(map);
}

/** Drop every expired entry — cheap housekeeping on app start. */
export function pruneSuggestionSnoozes(now = new Date()) {
  const map = readMap();
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    const ts = new Date(v).getTime();
    if (!Number.isFinite(ts) || ts <= now.getTime()) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) writeMap(map);
}
