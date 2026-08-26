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

/** Local "YYYY-MM-DDTHH:MM" key for an insight time or an event start. */
function startKey(value) {
  return String(value || "").replace(" ", "T").slice(0, 16);
}

/** Address fingerprints used to tie an event to an insight's location. */
function locationKeys(insight, job) {
  const raw = String(insight?.address || job?.serviceAddress || job?.address || "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  return {
    locKey: raw.replace(/[^a-z0-9]/g, "").slice(0, 14),
    streetNum: (raw.match(/\b(\d{2,6})\b/) || [])[1] || "",
  };
}

/** Looks like an appointment this brain would have created from an email. */
function isEmailAppointment(e) {
  return /inspection|con edison|city electrical|meter\s*install|appointment|energy services/i.test(
    String(e?.summary || "") + " " + String(e?.description || "")
  );
}

/**
 * The appointment(s) a reschedule replaces.
 *
 * A reschedule email carries the NEW time, so findEventForInsight (which matches
 * on that time) can't see the old booking — that's how the same job ended up on
 * the calendar twice (Levi 2026-07-27: 1127 Lincoln Place kept both tomorrow and
 * Friday the 7th). Here we look the other way: the job's linked event, or an
 * email-created appointment at the same address, at any time OTHER than the new
 * one.
 *
 * Only upcoming events are considered — a past visit is history, not a duplicate.
 *
 * @param {object} insight
 * @param {object|null} job
 * @param {Array} events
 * @param {{ now?: Date, newStart?: string }} [opts]
 * @returns {Array} events to remove, most recent first
 */
export function findPriorAppointmentsForInsight(insight, job, events, opts = {}) {
  const list = events || [];
  if (!list.length) return [];
  const now = opts.now || new Date();
  const newKey = startKey(opts.newStart || insight?.dateTime || "");
  const todayYmd = localYmdFromDate(now);

  const upcoming = list.filter((e) => {
    const start = evStart(e);
    if (!start) return false;
    // Same day counts: an appointment moved from 2pm to 5pm today is still a dup.
    if (start.slice(0, 10) < todayYmd) return false;
    return startKey(start) !== newKey;
  });
  if (!upcoming.length) return [];

  const linkedIds = new Set(
    [job?.calEventId, insight?.appliedEventId, insight?.eventId]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
  );
  const linked = upcoming.filter((e) => linkedIds.has(String(e.id)));

  const { locKey, streetNum } = locationKeys(insight, job);
  const sameplace = upcoming.filter((e) => {
    if (linkedIds.has(String(e.id))) return false;
    if (!isEmailAppointment(e)) return false;
    if (!locKey && !streetNum) return false;
    const el = String(e.location || e.summary || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return (
      (streetNum && el.includes(streetNum)) || (locKey && el.includes(locKey.slice(0, 10)))
    );
  });

  return [...linked, ...sameplaceSorted(sameplace)];
}

function sameplaceSorted(list) {
  return list.slice().sort((a, b) => evStart(a).localeCompare(evStart(b)));
}

function localYmdFromDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    const insp = sameTime.find(isEmailAppt);
    // Exact clock time alone is not enough — an unrelated meeting at 10:30
    // must not mark a Con Ed inspection as already_on_calendar.
    if (insp) return insp;
    return null;
  }

  // Same calendar day fallback (time may have been floored/adjusted).
  // Require location or inspection-keyword match — never a random same-day event
  // (Levi 2026-08-25: Aug 31 1337 President inspection matched "keep accounts active").
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
  return sameDay.find(isEmailAppt) || null;
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
