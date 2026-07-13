// Deep-link into the in-app Calendar tab with an appointment pre-selected.
import { clearPromptWorkPause } from "./followUpReminders.js";

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