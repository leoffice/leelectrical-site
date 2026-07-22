// Calendar event chip styling — inspection = light translucent red (Google colorId 11).

/** Google Calendar colorId 11 = Tomato (red). */
export const GCAL_RED_COLOR_ID = "11";

/** Inspection / Con Edison red-marked appointments. */
export function isInspectionEvent(ev) {
  if (!ev) return false;
  if (String(ev.colorId || "") === GCAL_RED_COLOR_ID) return true;
  const s = (ev.summary || "").toLowerCase();
  return /inspection|con edison appointment/.test(s);
}

/**
 * Chip classes for the week grid.
 * Inspections: light translucent red (not solid).
 * Selected: brand ring so the open event is obvious on the grid.
 */
export function eventChipClassName(ev, { selected = false } = {}) {
  const insp = isInspectionEvent(ev);
  const base =
    "w-full text-left rounded-lg border px-1.5 py-1 shadow-sm active:opacity-90 transition-shadow ";
  if (selected && insp) {
    return base + "bg-red-500/15 border-red-300/50 ring-2 ring-brand/50";
  }
  if (selected) {
    return base + "bg-brand-soft/50 border-brand/40 ring-2 ring-brand/50";
  }
  if (insp) {
    // Light translucent red — readable, not loud.
    return base + "bg-red-500/15 border-red-200/50";
  }
  return base + "bg-white border-slate-100 active:bg-slate-50";
}
