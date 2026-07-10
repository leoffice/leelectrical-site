// Login follow-up prompts — service-call appointments, must-today loop, inspections.
import { evStart } from "./format.js";
import { linkedJobForEvent, suggestJobsForEvent } from "./calendarLink.js";
import { addDays } from "./calendarDue.js";

export const STATE_KEY = "lepro_followup_state";
export const SERVICE_LOOKBACK_DAYS = 7;
export const WORK_START = 9;
export const WORK_END = 17;
export const SAME_DAY_NUDGE_HOURS = 2;

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

function eventYmd(event) {
  return evStart(event).slice(0, 10);
}

function daysAgoYmd(days, today) {
  return addDays(today, -days);
}

export function isEventHandled(state, eventId) {
  const st = eventState(state, eventId);
  return !!(st.handledAt || st.inspectionAcked);
}

/** Service calls from the past week that may need a follow-up popup. */
export function serviceCallCandidates(events, jobs, today, now = new Date()) {
  const state = loadState();
  const cut = daysAgoYmd(SERVICE_LOOKBACK_DAYS, today);
  return (events || [])
    .filter((e) => {
      const ymd = eventYmd(e);
      if (!ymd || ymd < cut || ymd > today) return false;
      if (!isServiceCallEvent(e)) return false;
      if (isEventHandled(state, e.id)) return false;
      const st = eventState(state, e.id);
      if (st.remindAt && new Date(st.remindAt) > now) return false;
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

export function scheduleSameDayPushOff(eventId, now = new Date()) {
  const st = eventState(loadState(), eventId);
  const pushOffCount = (st.pushOffCount || 0) + 1;
  const next = new Date(now);
  next.setHours(next.getHours() + SAME_DAY_NUDGE_HOURS);
  return patchEventState(eventId, {
    pushOffCount,
    nextNudgeAt: next.toISOString(),
    priority: "must_today",
  });
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

function stNote(eventId) {
  return eventState(loadState(), eventId).note || "";
}

/** Build the login prompt queue — nudges first, then inspections, then service calls. */
export function buildPromptQueue(events, jobs, today, now = new Date()) {
  const queue = [];
  for (const item of dueMustTodayNudges(events, jobs, today, now)) {
    queue.push({ kind: "must_today_nudge", ...item });
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

export { suggestJobsForEvent };