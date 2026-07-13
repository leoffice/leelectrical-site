// Login follow-up prompts — service-call appointments, must-today loop, inspections.
import { evStart } from "./format.js";
import { linkedJobForEvent, suggestJobsForEvent } from "./calendarLink.js";
import { addDays } from "./calendarDue.js";

export const STATE_KEY = "lepro_followup_state";
export const SERVICE_LOOKBACK_DAYS = 7;
export const WORK_START = 9;
export const WORK_END = 17;
export const SAME_DAY_NUDGE_HOURS = 2;

/** Quick snooze presets Levi asked for. */
export const SNOOZE_PRESETS = [
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

export const SNOOZE_SLIDER_MIN = 30;
export const SNOOZE_SLIDER_MAX = 300;
export const SNOOZE_SLIDER_STEP = 30;

export const REMINDER_PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "must_today", label: "Must get done today" },
];

const INSPECTION_RE = /\binspection\b/i;
const SERVICE_RE =
  /\b(service\s*call|estimate|install|repair|follow\s*-?\s*up|panel|outlet|wiring|visit|troubleshoot|callback)\b/i;

/** Varied firmer nudges — rotate so Levi doesn't tune them out. */
export const FIRMER_NUDGE_MESSAGES = [
  "Hey — this one's still on your plate today. Knock it out now and you're free the rest of the day. You've got this!",
  "Real talk: the customer is waiting on you. 15 minutes and this is off your mind. Go get it!",
  "I know you're busy, but this is the one that moves the needle today. Open it up and close the loop!",
  "Picture end of day with this DONE. Feels good, right? That's one tap away.",
  "Your future self will thank you — handle this follow-up before the afternoon gets away from you.",
  "This is the must-do item for today. Don't let it slip to tomorrow. You always feel better once it's handled.",
  "Alarm bells (friendly ones): this reminder is still live. Take care of it now — you'll be glad you did.",
];

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state || {}));
  } catch {
    /* storage unavailable */
  }
}

export function eventState(state, eventId) {
  const id = String(eventId || "");
  if (!id) return {};
  return (state && state[id]) || {};
}

export function patchEventState(eventId, patch) {
  const state = loadState();
  const id = String(eventId || "");
  state[id] = { ...eventState(state, id), ...patch, eventId: id };
  saveState(state);
  return state[id];
}

export function isWeekdayYmd(ymd) {
  const d = new Date(String(ymd) + "T12:00:00");
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export function nextBusinessDay(ymd) {
  let d = String(ymd || "");
  for (let i = 0; i < 10; i++) {
    d = addDays(d, 1);
    if (isWeekdayYmd(d)) return d;
  }
  return d;
}

export function isWorkHour(hour) {
  return hour >= WORK_START && hour < WORK_END;
}

/** Human label for snooze minutes — slider uses half-hour steps up to 5h. */
export function formatSnoozeDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!r) return h === 1 ? "1 hour" : `${h} hours`;
  const half = r === 30 ? "½" : `:${String(r).padStart(2, "0")}`;
  return h ? `${h}${half} hours` : `${r} min`;
}

function isSnoozed(st, now) {
  if (!st?.snoozeUntil) return false;
  return new Date(st.snoozeUntil) > now;
}

function remindAtDue(st, now) {
  if (!st?.remindAt) return false;
  return new Date(st.remindAt) <= now;
}

function localDatetime(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Default reminder slot: next weekday at 10:00 within work hours. */
export function defaultRemindDatetime(now = new Date()) {
  let d = new Date(now);
  if (!isWeekdayYmd(d.toISOString().slice(0, 10)) || d.getHours() >= WORK_END) {
    d.setDate(d.getDate() + 1);
    while (!isWeekdayYmd(d.toISOString().slice(0, 10))) d.setDate(d.getDate() + 1);
  }
  d.setHours(10, 0, 0, 0);
  if (d <= now) {
    d.setHours(Math.min(WORK_END - 1, now.getHours() + 1), 0, 0, 0);
    if (!isWorkHour(d.getHours())) d.setHours(10, 0, 0, 0);
  }
  return d.toISOString().slice(0, 16);
}

export function validateRemindDatetime(iso) {
  if (!iso || !iso.includes("T")) return "Pick a date and time";
  const [ymd, hm] = iso.split("T");
  const hour = parseInt(hm.slice(0, 2), 10);
  if (!isWeekdayYmd(ymd)) return "Weekdays only (Mon–Fri)";
  if (!isWorkHour(hour)) return "Work hours only (9:00 AM – 5:00 PM)";
  return "";
}

export function isInspectionEvent(event) {
  const hay = [event?.summary, event?.description, event?.location].filter(Boolean).join(" ");
  return INSPECTION_RE.test(hay);
}

export function isServiceCallEvent(event) {
  if (!event || isInspectionEvent(event)) return false;
  const hay = [event.summary, event.description].filter(Boolean).join(" ");
  return SERVICE_RE.test(hay) || /\b(estimate|service)\b/i.test(event.summary || "");
}

/** Past-week appointments worth a follow-up — service calls, linked jobs, customer visits. */
export function isPastWeekFollowUpEvent(event, jobs) {
  if (!event || isInspectionEvent(event)) return false;
  if (isServiceCallEvent(event)) return true;
  if (linkedJobForEvent(event, jobs)) return true;
  const summary = (event.summary || "").trim();
  const hay = [summary, event.description, event.location].filter(Boolean).join(" ");
  if (summary && /[—–-]/.test(summary) && /^[A-Za-z\u0590-\u05FF]/.test(summary)) return true;
  if (/\b(visit|appointment|on\s*site|walk[\s-]?through|consult|site\s*visit|meeting)\b/i.test(hay)) return true;
  return false;
}

function eventYmd(event) {
  return evStart(event).slice(0, 10);
}

function daysAgoYmd(days, today) {
  return addDays(today, -days);
}

export function isEventHandled(state, eventId) {
  const st = eventState(state, eventId);
  return !!(st.handledAt || st.inspectionAcked || st.noReminders);
}

/** True when Levi picked a next step or set a future reminder — skip the past-week popup. */
export function isEventAllocated(state, eventId, now = new Date()) {
  const st = eventState(state, eventId);
  if (st.noReminders) return true;
  if (st.nextStepAt) return true;
  if (st.remindAt) {
    if (new Date(st.remindAt) > now) return true;
    return true;
  }
  return false;
}

/** Levi chose an action (create job, estimate, email…) — don't re-prompt until reminder fires. */
export function allocateNextStep(eventId, stepKey, now = Date.now()) {
  return patchEventState(eventId, {
    nextStepAt: now,
    nextStepKey: String(stepKey || ""),
    remindAt: "",
    reminderAllocatedAt: "",
    pushOffCount: 0,
    nextNudgeAt: "",
    handledAt: "",
  });
}

/** Levi set a remind-me time — fires via scheduled_reminder when due. */
export function allocateReminderTime(eventId, remindAt, extras = {}) {
  return patchEventState(eventId, {
    remindAt,
    reminderAllocatedAt: Date.now(),
    nextStepAt: "",
    nextStepKey: "",
    pushOffCount: 0,
    nextNudgeAt: "",
    handledAt: "",
    ...extras,
  });
}

/** Service calls from the past week that may need a follow-up popup. */
export function serviceCallCandidates(events, jobs, today, now = new Date()) {
  const state = loadState();
  const cut = daysAgoYmd(SERVICE_LOOKBACK_DAYS, today);
  return (events || [])
    .filter((e) => {
      const ymd = eventYmd(e);
      if (!ymd || ymd < cut || ymd > today) return false;
      if (!isPastWeekFollowUpEvent(e, jobs)) return false;
      if (isEventHandled(state, e.id)) return false;
      if (isEventAllocated(state, e.id, now)) return false;
      const st = eventState(state, e.id);
      if (isSnoozed(st, now)) return false;
      return true;
    })
    .sort((a, b) => evStart(b).localeCompare(evStart(a)));
}

/** Inspection reminders: day before + day of (not past end of event day). */
export function inspectionCandidates(events, today) {
  const state = loadState();
  const tomorrow = addDays(today, 1);
  return (events || [])
    .filter((e) => {
      if (!isInspectionEvent(e)) return false;
      const ymd = eventYmd(e);
      if (ymd !== today && ymd !== tomorrow) return false;
      if (isEventHandled(state, e.id)) return false;
      return true;
    })
    .sort((a, b) => evStart(a).localeCompare(evStart(b)));
}

/** Must-today reminders due for same-day loop (initial or 2-hour firmer nudge). */
export function dueMustTodayNudges(events, jobs, today, now = new Date()) {
  const state = loadState();
  const out = [];
  for (const e of events || []) {
    const st = eventState(state, e.id);
    if (st.priority !== "must_today") continue;
    if (isEventHandled(state, e.id)) continue;
    if (isSnoozed(st, now)) continue;
    const remindYmd = (st.remindAt || "").slice(0, 10);
    if (remindYmd !== today) continue;
    const nextNudge = st.nextNudgeAt ? new Date(st.nextNudgeAt) : null;
    const remindAt = st.remindAt ? new Date(st.remindAt) : null;
    const due =
      (nextNudge && nextNudge <= now) ||
      (remindAt && remindAt <= now && !st.nextNudgeAt && st.pushOffCount > 0) ||
      (remindAt && remindAt <= now && !st.pushOffCount);
    if (due) out.push({ event: e, state: st, job: linkedJobForEvent(e, jobs) });
  }
  return out;
}

export function pickFirmerNudge(pushOffCount = 0, seed = "") {
  const pool = FIRMER_NUDGE_MESSAGES;
  let idx = pushOffCount % pool.length;
  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % pool.length;
    idx = (idx + h) % pool.length;
  }
  return pool[idx];
}

export function scheduleSameDayPushOff(eventId, now = new Date(), minutes = SAME_DAY_NUDGE_HOURS * 60) {
  patchEventState(eventId, { priority: "must_today" });
  return scheduleReminderSnooze(eventId, minutes, now);
}

/** Snooze one reminder — presets or slider minutes (max 5h). */
export function scheduleReminderSnooze(eventId, minutes, now = new Date()) {
  const st = eventState(loadState(), eventId);
  const mins = Math.min(SNOOZE_SLIDER_MAX, Math.max(1, Math.round(Number(minutes) || 0)));
  const next = new Date(now);
  next.setMinutes(next.getMinutes() + mins);
  const iso = next.toISOString();
  const patch = {
    snoozeUntil: iso,
    nextNudgeAt: iso,
  };
  if (st.priority === "must_today") {
    patch.pushOffCount = (st.pushOffCount || 0) + 1;
    patch.priority = "must_today";
  } else {
    patch.remindAt = localDatetime(next);
    patch.pushOffCount = 0;
  }
  return patchEventState(eventId, patch);
}

/** Snooze every reminder in the list by the same amount. */
export function batchSnoozeReminders(eventIds, minutes, now = new Date()) {
  const ids = [...new Set((eventIds || []).map((id) => String(id || "")).filter(Boolean))];
  return ids.map((id) => scheduleReminderSnooze(id, minutes, now));
}

/** Scheduled reminders whose remindAt has passed (any appointment age). */
export function dueScheduledReminders(events, jobs, today, now = new Date()) {
  const state = loadState();
  const out = [];
  for (const e of events || []) {
    const st = eventState(state, e.id);
    if (!st.remindAt || isEventHandled(state, e.id)) continue;
    if (isSnoozed(st, now)) continue;
    if (st.priority === "must_today" && st.remindAt.slice(0, 10) === today) continue;
    if (!remindAtDue(st, now)) continue;
    out.push({ event: e, state: st, job: linkedJobForEvent(e, jobs) });
  }
  return out;
}

/** Event ids in the queue that Levi can snooze together. */
export function snoozableQueueItems(queue) {
  return (queue || []).filter((x) => x.kind === "must_today_nudge" || x.kind === "scheduled_reminder");
}

export function scheduleNextBusinessDayReminder(eventId, note, today) {
  const nextDay = nextBusinessDay(today);
  const remindAt = nextDay + "T10:00";
  return patchEventState(eventId, {
    remindAt,
    note: note || stNote(eventId),
    priority: "medium",
    pushOffCount: 0,
    nextNudgeAt: "",
  });
}

/** Reschedule a reminder to a specific weekday + work-hour slot. */
export function rescheduleEventReminder(eventId, remindAt, { note, priority } = {}) {
  const st = eventState(loadState(), eventId);
  const patch = {
    remindAt,
    pushOffCount: 0,
    nextNudgeAt: "",
    handledAt: "",
  };
  if (note !== undefined) patch.note = note;
  if (priority !== undefined) patch.priority = priority;
  else if (st.priority === "must_today" && remindAt.slice(0, 10) !== (st.remindAt || "").slice(0, 10)) {
    patch.priority = "medium";
  }
  return patchEventState(eventId, patch);
}

function stNote(eventId) {
  return eventState(loadState(), eventId).note || "";
}

/** Build the login prompt queue — nudges first, then inspections, then service calls. */
export function buildPromptQueue(events, jobs, today, now = new Date()) {
  const queue = [];
  for (const item of dueMustTodayNudges(events, jobs, today, now)) {
    queue.push({ kind: "must_today_nudge", ...item });
  }
  for (const item of dueScheduledReminders(events, jobs, today, now)) {
    queue.push({ kind: "scheduled_reminder", ...item });
  }
  for (const event of inspectionCandidates(events, today)) {
    const ymd = eventYmd(event);
    queue.push({
      kind: "inspection",
      event,
      when: ymd === today ? "today" : "tomorrow",
      job: linkedJobForEvent(event, jobs),
    });
  }
  for (const event of serviceCallCandidates(events, jobs, today, now)) {
    queue.push({
      kind: "service_call",
      event,
      job: linkedJobForEvent(event, jobs),
      suggestions: suggestJobsForEvent(event, jobs),
    });
  }
  return queue;
}

/** Days between two YYYY-MM-DD strings (floor). */
export function daysBetween(earlier, later) {
  const a = new Date(String(earlier) + "T12:00:00").getTime();
  const b = new Date(String(later) + "T12:00:00").getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function firstName(customer) {
  return (customer || "").trim().split(/\s+/)[0] || "the customer";
}

function timeAgoPhrase(days) {
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "about a week ago";
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `about ${weeks} weeks ago`;
  return "a while back";
}

/** Friendly nudge Levi sees when a reminder fires — uses appointment + job context. */
export function generateReminderNudge({ event, job, userNote, today }) {
  const note = (userNote || "").trim();
  const evYmd = eventYmd(event);
  const days = evYmd && today ? daysBetween(evYmd, today) : 0;
  const when = timeAgoPhrase(days);
  const name = firstName(job?.customer || event?.summary?.split(/[—–-]/)[0]?.trim());
  const hasEst = !!(job?.estimateNo || job?._estimateConfirmed || job?.estimateLines?.length);
  const hasInv = !!(job?.invoiceNo || job?._invoiceConfirmed);

  if (note) {
    const lead = when === "yesterday" ? "Yesterday" : `About ${when.replace("about ", "")}`;
    return `${lead} you noted: “${note}.” ${name} is still on your list — friendly follow-up when you're ready.`;
  }
  if (!hasEst && job) {
    return `You saw ${name} ${when} — no estimate yet. Worth putting one together or logging what you discussed.`;
  }
  if (hasEst && !hasInv) {
    return `You met with ${name} ${when} — estimate's out. What's the next step — approval, changes, or ready to invoice?`;
  }
  if (hasEst && hasInv) {
    return `You sent paperwork to ${name} ${when}. A quick friendly check-in on the estimate or invoice never hurts.`;
  }
  if (hasInv) {
    return `Invoice is out for ${name} from ${when}. A polite payment reminder could move things along.`;
  }
  if (job) {
    return `You saw ${name} ${when} for this job — worth a quick follow-up when you have a minute.`;
  }
  const appt = (event?.summary || "this appointment").trim();
  return `It's been ${when} since ${appt}. Tap through when you're ready to follow up.`;
}

/** Mark appointment as handled — no more follow-up popups. */
export function dismissEventReminders(eventId, { noReminders = false } = {}) {
  return patchEventState(eventId, {
    handledAt: Date.now(),
    noReminders: !!noReminders,
    remindAt: "",
    nextNudgeAt: "",
    snoozeUntil: "",
  });
}

export { suggestJobsForEvent };