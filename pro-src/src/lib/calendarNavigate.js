// Deep-link into the in-app Calendar tab with an appointment pre-selected.
import { clearPromptWorkPause } from "./followUpReminders.js";
import { evStart } from "./format.js";

export const CALENDAR_PICK_KEY = "lepro_calendar_pick";
export const CALENDAR_PICK_EVENT = "lepro-calendar-pick";
export const REMINDER_RETURN_KEY = "lepro_reminder_return";
export const PENDING_DOC_AFTER_JOB_KEY = "lepro_pending_doc_after_job";
export const RESTORE_REMINDER_EVENT = "lepro-restore-reminder";

function parsePickRaw(raw) {
  if (!raw) return null;
  // Legacy: plain event id string
  if (raw[0] !== "{") {
    const eventId = String(raw).trim();
    return eventId ? { eventId, focusDate: "" } : null;
  }
  try {
    const o = JSON.parse(raw);
    const eventId = String(o?.eventId || o?.id || "").trim();
    const focusDate = String(o?.focusDate || "").slice(0, 10);
    if (!eventId && !focusDate) return null;
    return { eventId, focusDate };
  } catch {
    return null;
  }
}

function signalCalendarPick() {
  try {
    window.dispatchEvent(new CustomEvent(CALENDAR_PICK_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Remember which appointment to open on the Calendar tab.
 * @param {string|{eventId?:string,id?:string,focusDate?:string}} eventIdOrPayload
 * @param {{focusDate?:string}} [opts]
 */
export function stashCalendarPick(eventIdOrPayload, opts = {}) {
  let eventId = "";
  let focusDate = String(opts.focusDate || "").slice(0, 10);
  if (eventIdOrPayload && typeof eventIdOrPayload === "object") {
    eventId = String(eventIdOrPayload.eventId || eventIdOrPayload.id || "").trim();
    if (!focusDate) focusDate = String(eventIdOrPayload.focusDate || "").slice(0, 10);
  } else {
    eventId = String(eventIdOrPayload || "").trim();
  }
  if (!eventId && !focusDate) return;
  try {
    sessionStorage.setItem(CALENDAR_PICK_KEY, JSON.stringify({ eventId, focusDate }));
  } catch {
    /* ignore */
  }
  signalCalendarPick();
}

/** Read the pending calendar pick without clearing it. */
export function peekCalendarPick() {
  try {
    return parsePickRaw(sessionStorage.getItem(CALENDAR_PICK_KEY) || "");
  } catch {
    return null;
  }
}

/** Clear the pending pick (after it was applied or abandoned). */
export function clearCalendarPick() {
  try {
    sessionStorage.removeItem(CALENDAR_PICK_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Consume and return the event id (legacy API).
 * Prefer peekCalendarPick + clearCalendarPick when you also need focusDate.
 */
export function consumeCalendarPick() {
  const p = peekCalendarPick();
  clearCalendarPick();
  return p?.eventId || "";
}

/**
 * Resolve which calendar event an email insight created / refers to.
 * Prefer job.calEventId / insight.appliedEventId, then same start time.
 */
export function findEventForInsight(insight, job, events) {
  const list = events || [];
  const ids = [job?.calEventId, insight?.appliedEventId, insight?.eventId]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  for (const id of ids) {
    const hit = list.find((e) => String(e.id) === id);
    if (hit) return hit;
  }
  const dt = String(insight?.dateTime || "")
    .replace(" ", "T")
    .slice(0, 16);
  if (!dt || dt.length < 10) return null;
  const locRaw = String(insight?.address || job?.serviceAddress || job?.address || "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const locKey = locRaw.replace(/[^a-z0-9]/g, "").slice(0, 14);
  const streetNum = (locRaw.match(/\b(\d{2,6})\b/) || [])[1] || "";
  const isEmailAppt = (e) =>
    /inspection|con edison|city electrical|meter\s*install|appointment|energy services/i.test(
      String(e?.summary || "") + " " + String(e?.description || "")
    );

  const sameTime = list.filter((e) => evStart(e).replace(" ", "T").slice(0, 16) === dt);
  if (sameTime.length) {
    if (locKey || streetNum) {
      const byLoc = sameTime.find((e) => {
        const el = String(e.location || e.summary || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        return (streetNum && el.includes(streetNum)) || (locKey && el.includes(locKey.slice(0, 10)));
      });
      if (byLoc) return byLoc;
    }
    if (sameTime.length === 1) return sameTime[0];
    const insp = sameTime.find(isEmailAppt);
    return insp || sameTime[0];
  }

  // Same calendar day fallback (time may have been floored/adjusted).
  const day = dt.slice(0, 10);
  const sameDay = list.filter((e) => evStart(e).slice(0, 10) === day);
  if (!sameDay.length) return null;
  if (locKey || streetNum) {
    const byLoc = sameDay.find((e) => {
      const el = String(e.location || e.summary || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return (streetNum && el.includes(streetNum)) || (locKey && el.includes(locKey.slice(0, 10)));
    });
    if (byLoc) return byLoc;
  }
  const insp = sameDay.find(isEmailAppt);
  return insp || sameDay[0];
}

/**
 * Resolve a stashed pick against the live events list.
 * Returns { event, focusDate } — event may be null if only the day is known.
 */
export function resolveCalendarPick(events, pick = peekCalendarPick()) {
  if (!pick) return null;
  const list = events || [];
  const focusDate = pick.focusDate || "";
  let event = null;
  if (pick.eventId) {
    event = list.find((e) => String(e.id) === String(pick.eventId)) || null;
  }
  if (!event && focusDate) {
    const sameDay = list.filter((e) => evStart(e).slice(0, 10) === focusDate);
    if (sameDay.length === 1) event = sameDay[0];
    else if (sameDay.length > 1) {
      event =
        sameDay.find((e) => /inspection|con edison|city electrical/i.test(e.summary || "")) ||
        sameDay[0];
    }
  }
  if (!event && !focusDate) return null;
  return {
    event,
    focusDate: focusDate || (event ? evStart(event).slice(0, 10) : ""),
  };
}

/** Remember which reminder popup to restore after calendar → appointment → back. */
export function stashReminderReturn(payload) {
  if (!payload?.eventId) return;
  try {
    sessionStorage.setItem(REMINDER_RETURN_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekReminderReturn() {
  try {
    const raw = sessionStorage.getItem(REMINDER_RETURN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function consumeReminderReturn() {
  try {
    const raw = sessionStorage.getItem(REMINDER_RETURN_KEY);
    if (raw) sessionStorage.removeItem(REMINDER_RETURN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearReminderReturn() {
  try {
    sessionStorage.removeItem(REMINDER_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function signalRestoreReminder() {
  try {
    window.dispatchEvent(new CustomEvent(RESTORE_REMINDER_EVENT));
  } catch {
    /* ignore */
  }
}

/** After job create from a reminder, open estimate or invoice builder next. */
export function stashPendingDocAfterJob(docKind) {
  const kind = docKind === "invoice" ? "invoice" : docKind === "estimate" ? "estimate" : "";
  if (!kind) return;
  try {
    sessionStorage.setItem(PENDING_DOC_AFTER_JOB_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function consumePendingDocAfterJob() {
  try {
    const v = sessionStorage.getItem(PENDING_DOC_AFTER_JOB_KEY) || "";
    if (v) sessionStorage.removeItem(PENDING_DOC_AFTER_JOB_KEY);
    return v === "invoice" || v === "estimate" ? v : "";
  } catch {
    return "";
  }
}

/** Levi finished a save — show the next reminder if one is waiting. */
export function resumeFollowUpPrompts() {
  clearPromptWorkPause();
  signalRestoreReminder();
}
