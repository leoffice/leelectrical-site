// Deep-link into the in-app Calendar tab with an appointment pre-selected.
export const CALENDAR_PICK_KEY = "lepro_calendar_pick";

export function stashCalendarPick(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(CALENDAR_PICK_KEY, id);
  } catch {
    /* ignore */
  }
}

export function consumeCalendarPick() {
  try {
    const id = sessionStorage.getItem(CALENDAR_PICK_KEY) || "";
    if (id) sessionStorage.removeItem(CALENDAR_PICK_KEY);
    return id;
  } catch {
    return "";
  }
}