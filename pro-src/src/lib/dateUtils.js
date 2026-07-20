/** Shared local-calendar date helpers (no app-domain imports). */

/**
 * Days between two YYYY-MM-DD strings (floor).
 * Parses both sides at local noon so timezone edges stay on the intended day.
 * Future earlier→later pairs clamp to 0.
 */
export function daysBetween(earlier, later) {
  const a = new Date(String(earlier) + "T12:00:00").getTime();
  const b = new Date(String(later) + "T12:00:00").getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/** Local calendar YYYY-MM-DD for a Date (not UTC). */
export function localYmd(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
