// Deep-link into the in-app Calendar tab with an appointment pre-selected.
import { clearPromptWorkPause } from "./followUpReminders.js";
import { evStart } from "./format.js";

export const CALENDAR_PICK_KEY = "lepro_calendar_pick";
export const REMINDER_RETURN_KEY = "lepro_reminder_return";
export const PENDING_DOC_AFTER_JOB_KEY = "lepro_pending_doc_after_job";
export const RESTORE_REMINDER_EVENT = "lepro-restore-reminder";

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
  const sameTime = list.filter((e) => evStart(e).replace(" ", "T").slice(0, 16) === dt);
  if (!sameTime.length) {
    // Same calendar day fallback (time may have been floored/adjusted).
    const day = dt.slice(0, 10);
    const sameDay = list.filter((e) => evStart(e).slice(0, 10) === day);
    if (!sameDay.length) return null;
    const loc = String(insight?.address || job?.serviceAddress || job?.address || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .slice(0, 18);
    if (loc) {
      const byLoc = sameDay.find((e) => String(e.location || "").toLowerCase().includes(loc.slice(0, 10)));
      if (byLoc) return byLoc;
    }
    const insp = sameDay.find((e) => /inspection|con edison|city electrical/i.test(e.summary || ""));
    return insp || sameDay[0];
  }
  if (sameTime.length === 1) return sameTime[0];
  const insp = sameTime.find((e) => /inspection|con edison|city electrical/i.test(e.summary || ""));
  return insp || sameTime[0];
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