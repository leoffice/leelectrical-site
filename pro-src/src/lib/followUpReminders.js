// Login follow-up prompts — service-call appointments, must-today loop, inspections.
import { evStart } from "./format.js";
import { linkedJobForEvent, suggestJobsForEvent } from "./calendarLink.js";
import { addDays } from "./calendarDue.js";
import {
  assessJobFollowUp,
  specificFollowUpNudge,
  unsentDocCandidates,
  unsentDocLead,
} from "./followUpStatus.js";

export const STATE_KEY = "lepro_followup_state";
export const SERVICE_LOOKBACK_DAYS = 7;
export const WORK_START = 9;
export const WORK_END = 17;
export const SAME_DAY_NUDGE_HOURS = 2;

/** After Levi picks an action, hide popups while he's active — max 5 min, or sooner when idle. */
export const PROMPT_WORK_PAUSE_MS = 5 * 60 * 1000;
export const PROMPT_IDLE_MS = 45 * 1000;
const PROMPT_WORK_PAUSE_KEY = "lepro_prompt_work_pause";

/** Quick snooze presets for individual reminder sheets. */
export const SNOOZE_PRESETS = [
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

/** Global pause presets — short options at the top of the app. */
export const PAUSE_PRESETS = [
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
];

export const SNOOZE_SLIDER_MIN = 30;
export const SNOOZE_SLIDER_MAX = 300;
export const SNOOZE_SLIDER_STEP = 30;

export const PAUSE_SLIDER_MIN = 5;
export const PAUSE_SLIDER_MAX = 120;
export const PAUSE_SLIDER_STEP = 5;

export const GLOBAL_PAUSE_KEY = "lepro_reminders_paused_until";

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

function maybeAutoPostponeSendCooldown(eventId, assessment, state) {
  if (!assessment?.autoRemindAt || !assessment.reason?.endsWith("_cooldown")) return;
  const st = eventState(state, eventId);
  const target = assessment.autoRemindAt;
  if (st.remindAt && st.remindAt >= target) return;
  if (st.nextStepAt && !st.remindAt) return;
  patchEventState(eventId, {
    remindAt: target,
    reminderAllocatedAt: Date.now(),
    nudge: assessment.nudge || "",
    note: assessment.docKind === "invoice" ? "Email invoice follow-up" : "Email estimate follow-up",
    priority: "medium",
    pushOffCount: 0,
    nextNudgeAt: "",
    autoPostponed: true,
  });
}

/** Service calls from the past week that may need a follow-up popup. */
export function serviceCallCandidates(events, jobs, today, now = new Date(), commands = []) {
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
      const job = linkedJobForEvent(e, jobs);
      const assessment = assessJobFollowUp(job, today, commands);
      if (assessment.suppressServiceCall) {
        maybeAutoPostponeSendCooldown(e.id, assessment, state);
        return false;
      }
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

export function remindersPausedUntil(now = new Date()) {
  try {
    const raw = localStorage.getItem(GLOBAL_PAUSE_KEY);
    if (!raw) return null;
    const until = new Date(raw);
    if (!(until > now)) {
      localStorage.removeItem(GLOBAL_PAUSE_KEY);
      return null;
    }
    return until;
  } catch {
    return null;
  }
}

export function isRemindersPaused(now = new Date()) {
  return !!remindersPausedUntil(now);
}

/** Pause every reminder popup until the chosen time. */
export function pauseAllReminders(minutes, now = new Date()) {
  const mins = Math.max(1, Math.round(Number(minutes) || 0));
  const until = new Date(now);
  until.setMinutes(until.getMinutes() + mins);
  try {
    localStorage.setItem(GLOBAL_PAUSE_KEY, until.toISOString());
  } catch {
    /* storage unavailable */
  }
  return until;
}

export function clearRemindersPause() {
  try {
    localStorage.removeItem(GLOBAL_PAUSE_KEY);
  } catch {
    /* ignore */
  }
}

const PRIORITY_RANK = { must_today: 0, high: 1, medium: 2, low: 3 };

function priorityRank(key) {
  return PRIORITY_RANK[key] ?? 4;
}

function reminderSortKey(item) {
  const p = priorityRank(item.priority || item.state?.priority);
  const due = item.dueAt || item.state?.remindAt || item.state?.snoozeUntil || "";
  return [p, due, item.headline || ""];
}

function compareReminders(a, b) {
  const [pa, da, ha] = reminderSortKey(a);
  const [pb, db, hb] = reminderSortKey(b);
  if (pa !== pb) return pa - pb;
  if (da !== db) return String(da).localeCompare(String(db));
  return String(ha).localeCompare(String(hb));
}

/** All active reminders for the Reminders tab — same sources as popups, sorted by priority. */
export function buildReminderList(events, jobs, today, now = new Date(), commands = []) {
  const list = [];
  const state = loadState();

  for (const item of unsentDocCandidates(jobs, commands)) {
    const label = item.docKind === "invoice" ? "Invoice" : "Estimate";
    const no = item.docNo ? " #" + item.docNo : "";
    list.push({
      id: "unsent:" + item.job.id + ":" + item.docKind,
      kind: "unsent_doc",
      priority: "high",
      headline: "Unsent " + label.toLowerCase() + no,
      detail: unsentDocLead(item),
      job: item.job,
      docKind: item.docKind,
      docNo: item.docNo,
      dueAt: "",
    });
  }

  for (const e of events || []) {
    const st = eventState(state, e.id);
    if (isEventHandled(state, e.id)) continue;
    if (st.priority === "must_today" && (st.remindAt || "").slice(0, 10) === today) {
      list.push({
        id: "must:" + e.id,
        kind: "must_today_nudge",
        priority: "must_today",
        headline: e.summary || "Must-do today",
        detail: st.note || st.nudge || "",
        event: e,
        state: st,
        job: linkedJobForEvent(e, jobs),
        dueAt: st.remindAt || st.nextNudgeAt || "",
      });
      continue;
    }
    if (st.remindAt) {
      list.push({
        id: "sched:" + e.id,
        kind: "scheduled_reminder",
        priority: st.priority || "medium",
        headline: e.summary || "Reminder",
        detail: st.note || st.nudge || "",
        event: e,
        state: st,
        job: linkedJobForEvent(e, jobs),
        dueAt: st.remindAt,
      });
    }
  }

  for (const event of inspectionCandidates(events, today)) {
    const ymd = eventYmd(event);
    list.push({
      id: "insp:" + event.id,
      kind: "inspection",
      priority: "high",
      headline: event.summary || "Inspection",
      detail: ymd === today ? "Today" : "Tomorrow",
      event,
      when: ymd === today ? "today" : "tomorrow",
      job: linkedJobForEvent(event, jobs),
      dueAt: evStart(event),
    });
  }

  for (const event of serviceCallCandidates(events, jobs, today, now, commands)) {
    const job = linkedJobForEvent(event, jobs);
    const assessment = assessJobFollowUp(job, today, commands);
    list.push({
      id: "svc:" + event.id,
      kind: "service_call",
      priority: "medium",
      headline: event.summary || "Follow up",
      detail: assessment?.nudge || "",
      event,
      job,
      assessment,
      suggestions: suggestJobsForEvent(event, jobs),
      dueAt: evStart(event),
    });
  }

  return list.sort(compareReminders);
}

export function activeReminderCount(events, jobs, today, now = new Date(), commands = []) {
  if (isRemindersPaused(now)) return 0;
  return buildReminderList(events, jobs, today, now, commands).length;
}

/** Build the login prompt queue — nudges first, then inspections, then service calls. */
export function buildPromptQueue(events, jobs, today, now = new Date(), commands = []) {
  if (isRemindersPaused(now)) return [];
  const queue = [];
  for (const item of dueMustTodayNudges(events, jobs, today, now)) {
    queue.push({ kind: "must_today_nudge", ...item });
  }
  for (const item of dueScheduledReminders(events, jobs, today, now)) {
    queue.push({ kind: "scheduled_reminder", ...item });
  }
  for (const item of unsentDocCandidates(jobs, commands)) {
    queue.push({ kind: "unsent_doc", ...item });
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
  for (const event of serviceCallCandidates(events, jobs, today, now, commands)) {
    const job = linkedJobForEvent(event, jobs);
    const assessment = assessJobFollowUp(job, today, commands);
    queue.push({
      kind: "service_call",
      event,
      job,
      suggestions: suggestJobsForEvent(event, jobs),
      assessment,
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
export function generateReminderNudge({ event, job, userNote, today, commands = [] }) {
  const note = (userNote || "").trim();
  const specific = specificFollowUpNudge(job, today, commands);
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
  if (specific) return specific;
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

function readWorkPause() {
  try {
    const raw = sessionStorage.getItem(PROMPT_WORK_PAUSE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.startedAt) return null;
    return {
      startedAt: Number(o.startedAt) || 0,
      lastActivityAt: Number(o.lastActivityAt) || Number(o.startedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** Levi chose an action — hide reminder popups while he works. */
export function beginPromptWorkPause(now = Date.now()) {
  try {
    sessionStorage.setItem(
      PROMPT_WORK_PAUSE_KEY,
      JSON.stringify({ startedAt: now, lastActivityAt: now })
    );
  } catch {
    /* ignore */
  }
}

/** Keep the work pause alive while Levi is clicking around the app. */
export function touchPromptActivity(now = Date.now()) {
  const st = readWorkPause();
  if (!st) return;
  try {
    sessionStorage.setItem(
      PROMPT_WORK_PAUSE_KEY,
      JSON.stringify({ ...st, lastActivityAt: now })
    );
  } catch {
    /* ignore */
  }
}

export function clearPromptWorkPause() {
  try {
    sessionStorage.removeItem(PROMPT_WORK_PAUSE_KEY);
  } catch {
    /* ignore */
  }
}

/** True while Levi is mid-task — suppress login reminder popups. */
export function shouldSuppressPrompts(now = Date.now()) {
  const st = readWorkPause();
  if (!st) return false;
  const idleFor = now - st.lastActivityAt;
  const pausedFor = now - st.startedAt;
  if (idleFor >= PROMPT_IDLE_MS) return false;
  if (pausedFor >= PROMPT_WORK_PAUSE_MS) return false;
  return true;
}

export function promptWorkPauseStatus(now = Date.now()) {
  const st = readWorkPause();
  if (!st) return { active: false };
  const idleFor = now - st.lastActivityAt;
  const pausedFor = now - st.startedAt;
  if (idleFor >= PROMPT_IDLE_MS) return { active: false, reason: "idle", idleFor, pausedFor };
  if (pausedFor >= PROMPT_WORK_PAUSE_MS) return { active: false, reason: "max", idleFor, pausedFor };
  return { active: true, idleFor, pausedFor };
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