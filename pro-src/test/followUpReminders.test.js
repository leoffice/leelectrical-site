/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  STATE_KEY,
  allocateNextStep,
  allocateReminderTime,
  batchSnoozeReminders,
  buildPromptQueue,
  dismissEventReminders,
  dueScheduledReminders,
  formatSnoozeDuration,
  generateReminderNudge,
  inspectionCandidates,
  isEventAllocated,
  isInspectionEvent,
  isPastWeekFollowUpEvent,
  isServiceCallEvent,
  pickFirmerNudge,
  rescheduleEventReminder,
  scheduleReminderSnooze,
  scheduleSameDayPushOff,
  serviceCallCandidates,
  snoozableQueueItems,
  validateRemindDatetime,
  suggestJobsForEvent,
  beginPromptWorkPause,
  shouldSuppressPrompts,
  touchPromptActivity,
  clearPromptWorkPause,
  PROMPT_IDLE_MS,
  PROMPT_WORK_PAUSE_MS,
} from "../src/lib/followUpReminders.js";
import {
  consumeCalendarPick,
  peekReminderReturn,
  signalRestoreReminder,
  stashCalendarPick,
  stashReminderReturn,
} from "../src/lib/calendarNavigate.js";
import {
  isDaySelectable,
  monthGrid,
  workHourSlots,
} from "../src/lib/reminderPicker.js";

const today = "2026-07-10";

beforeEach(() => {
  localStorage.removeItem(STATE_KEY);
  sessionStorage.clear();
});

describe("followUpReminders", () => {
  it("detects service calls vs inspections", () => {
    expect(isInspectionEvent({ summary: "DOB Inspection — 123 Main" })).toBe(true);
    expect(isServiceCallEvent({ summary: "Service call — Peretz Chein" })).toBe(true);
    expect(isServiceCallEvent({ summary: "DOB Inspection" })).toBe(false);
  });

  it("serviceCallCandidates returns past-week service calls not yet handled", () => {
    const events = [
      { id: "e1", summary: "Service call — Jane", start: "2026-07-08T10:00" },
      { id: "e2", summary: "Inspection", start: "2026-07-09T10:00" },
      { id: "old", summary: "Service call — old", start: "2026-06-01T10:00" },
    ];
    const hits = serviceCallCandidates(events, [], today);
    expect(hits.map((e) => e.id)).toEqual(["e1"]);
  });

  it("isPastWeekFollowUpEvent includes linked jobs and customer appointments", () => {
    const jobs = [{ id: "J-1", customer: "Michelle", calendarEventId: "ev-m" }];
    expect(isPastWeekFollowUpEvent({ id: "ev-m", summary: "Michelle — panel", start: "2026-07-08T10:00" }, jobs)).toBe(
      true
    );
    expect(isPastWeekFollowUpEvent({ id: "ev-x", summary: "Site visit — Bob", start: "2026-07-08T10:00" }, [])).toBe(
      true
    );
    expect(isPastWeekFollowUpEvent({ id: "ev-i", summary: "Inspection", start: "2026-07-08T10:00" }, [])).toBe(false);
  });

  it("serviceCallCandidates picks up linked customer appointments without service-call keyword", () => {
    const jobs = [{ id: "J-2", customer: "Michelle", calendarEventId: "michelle" }];
    const events = [{ id: "michelle", summary: "Michelle — follow up", start: "2026-07-07T14:00" }];
    const hits = serviceCallCandidates(events, jobs, "2026-07-10");
    expect(hits.map((e) => e.id)).toEqual(["michelle"]);
  });

  it("generateReminderNudge asks about next step when estimate exists", () => {
    const event = { id: "e1", summary: "Michelle", start: "2026-07-07T10:00" };
    const job = { id: "J-1", customer: "Michelle", estimateNo: "251900" };
    const msg = generateReminderNudge({ event, job, userNote: "", today: "2026-07-10" });
    expect(msg).toMatch(/next step|approval|invoice/i);
  });

  it("generateReminderNudge prompts estimate when job has no docs", () => {
    const event = { id: "e1", summary: "Bob visit", start: "2026-07-07T10:00" };
    const job = { id: "J-1", customer: "Bob" };
    const msg = generateReminderNudge({ event, job, userNote: "", today: "2026-07-10" });
    expect(msg).toMatch(/no estimate|estimate yet/i);
  });

  it("inspectionCandidates includes today and tomorrow only", () => {
    const events = [
      { id: "today", summary: "Final inspection", start: "2026-07-10T14:00" },
      { id: "tom", summary: "Inspection appointment", start: "2026-07-11T09:00" },
      { id: "later", summary: "Inspection", start: "2026-07-15T09:00" },
    ];
    expect(inspectionCandidates(events, today).map((e) => e.id)).toEqual(["today", "tom"]);
  });

  it("validateRemindDatetime enforces weekdays and work hours", () => {
    expect(validateRemindDatetime("2026-07-11T10:00")).toBe("Weekdays only (Mon–Fri)");
    expect(validateRemindDatetime("2026-07-10T08:00")).toBe("Work hours only (9:00 AM – 5:00 PM)");
    expect(validateRemindDatetime("2026-07-10T10:00")).toBe("");
  });

  it("scheduleSameDayPushOff sets 2-hour next nudge", () => {
    const now = new Date("2026-07-10T10:00:00");
    const st = scheduleSameDayPushOff("ev1", now);
    expect(st.pushOffCount).toBe(1);
    expect(st.nextNudgeAt).toBe(new Date("2026-07-10T12:00:00").toISOString());
  });

  it("pickFirmerNudge rotates messages", () => {
    const a = pickFirmerNudge(0, "ev1");
    const b = pickFirmerNudge(1, "ev1");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("buildPromptQueue orders nudges, inspections, then service calls", () => {
    const events = [
      { id: "nudge-ev", summary: "Service call — Bob", start: "2026-07-09T10:00" },
      { id: "svc", summary: "Service call — Jane", start: "2026-07-09T11:00" },
      { id: "insp", summary: "Inspection — site", start: "2026-07-10T09:00" },
    ];
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        "nudge-ev": {
          priority: "must_today",
          remindAt: "2026-07-10T09:00",
          pushOffCount: 1,
          nextNudgeAt: "2026-07-10T08:00",
        },
      })
    );
    const now = new Date("2026-07-10T10:00:00");
    const q = buildPromptQueue(events, [], today, now);
    expect(q[0].kind).toBe("must_today_nudge");
    expect(q.some((x) => x.kind === "inspection")).toBe(true);
    expect(q.some((x) => x.kind === "service_call")).toBe(true);
  });

  it("generateReminderNudge uses note and job context", () => {
    const event = { id: "e1", summary: "Service call — Bob", start: "2026-07-03T10:00" };
    const job = { id: "J-1", customer: "Bob Smith", estimateNo: "251900" };
    const withNote = generateReminderNudge({ event, job, userNote: "waiting on approval", today });
    expect(withNote).toContain("waiting on approval");
    const noNote = generateReminderNudge({ event, job, userNote: "", today });
    expect(noNote).toContain("Bob");
    expect(noNote).toMatch(/estimate|met/i);
  });

  it("dismissEventReminders marks noReminders handled", () => {
    dismissEventReminders("ev9", { noReminders: true });
    const raw = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(raw.ev9.noReminders).toBe(true);
    expect(raw.ev9.handledAt).toBeTruthy();
  });

  it("reminderPicker grays out weekends and limits work hours", () => {
    expect(isDaySelectable("2026-07-11", today)).toBe(false);
    expect(isDaySelectable("2026-07-10", today)).toBe(true);
    const grid = monthGrid(2026, 6);
    const sat = grid.find((c) => c.inMonth && c.key === "2026-07-11");
    expect(sat.weekend).toBe(true);
    expect(workHourSlots().length).toBeGreaterThan(8);
    expect(workHourSlots()[0].hour).toBe(9);
  });

  it("rescheduleEventReminder moves remindAt and clears push-off loop", () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        ev1: {
          priority: "must_today",
          remindAt: "2026-07-10T09:00",
          note: "call back",
          pushOffCount: 2,
          nextNudgeAt: "2026-07-10T12:00",
        },
      })
    );
    const st = rescheduleEventReminder("ev1", "2026-07-14T11:00");
    expect(st.remindAt).toBe("2026-07-14T11:00");
    expect(st.pushOffCount).toBe(0);
    expect(st.nextNudgeAt).toBe("");
    expect(st.priority).toBe("medium");
    expect(st.note).toBe("call back");
  });

  it("calendarNavigate stashes and consumes a pick id once", () => {
    stashCalendarPick("evt-99");
    expect(consumeCalendarPick()).toBe("evt-99");
    expect(consumeCalendarPick()).toBe("");
  });

  it("reminder return stack stashes and restores", () => {
    stashReminderReturn({ eventId: "ev-1", kind: "service_call" });
    expect(peekReminderReturn()?.eventId).toBe("ev-1");
    let fired = false;
    const h = () => {
      fired = true;
    };
    window.addEventListener("lepro-restore-reminder", h);
    signalRestoreReminder();
    window.removeEventListener("lepro-restore-reminder", h);
    expect(fired).toBe(true);
  });

  it("suggestJobsForEvent matches customer and address", () => {
    const event = { id: "e1", summary: "Peretz Chein — panel", location: "12 Main St", start: "2026-07-09T10:00" };
    const jobs = [
      { id: "J-1", customer: "Peretz Chein", address: "12 Main St, Brooklyn" },
      { id: "J-2", customer: "Other", address: "99 Oak" },
    ];
    expect(suggestJobsForEvent(event, jobs).map((j) => j.id)).toEqual(["J-1"]);
  });

  it("formatSnoozeDuration labels presets and slider values", () => {
    expect(formatSnoozeDuration(10)).toBe("10 min");
    expect(formatSnoozeDuration(60)).toBe("1 hour");
    expect(formatSnoozeDuration(90)).toBe("1½ hours");
    expect(formatSnoozeDuration(300)).toBe("5 hours");
  });

  it("scheduleReminderSnooze delays remindAt and respects snooze window", () => {
    const now = new Date("2026-07-13T09:00:00");
    const st = scheduleReminderSnooze("ev1", 30, now);
    expect(st.snoozeUntil).toBe(new Date("2026-07-13T09:30:00").toISOString());
    expect(st.remindAt).toBe("2026-07-13T09:30");
    localStorage.setItem(STATE_KEY, JSON.stringify({ ev1: st }));
    expect(
      dueScheduledReminders([{ id: "ev1", summary: "Follow up", start: "2026-06-01T10:00" }], [], "2026-07-13", now)
    ).toHaveLength(0);
    const later = new Date("2026-07-13T09:31:00");
    expect(
      dueScheduledReminders([{ id: "ev1", summary: "Follow up", start: "2026-06-01T10:00" }], [], "2026-07-13", later)
    ).toHaveLength(1);
  });

  it("dueScheduledReminders catches old appointments outside the service-call lookback", () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        old: { remindAt: "2026-07-13T08:00", note: "call back", priority: "medium" },
      })
    );
    const now = new Date("2026-07-13T09:00:00");
    const hits = dueScheduledReminders(
      [{ id: "old", summary: "Service call — Jane", start: "2026-05-01T10:00" }],
      [],
      "2026-07-13",
      now
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].event.id).toBe("old");
  });

  it("batchSnoozeReminders snoozes every id in the list", () => {
    const now = new Date("2026-07-13T10:00:00");
    batchSnoozeReminders(["a", "b"], 10, now);
    const raw = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(raw.a.snoozeUntil).toBe(new Date("2026-07-13T10:10:00").toISOString());
    expect(raw.b.snoozeUntil).toBe(new Date("2026-07-13T10:10:00").toISOString());
  });

  it("buildPromptQueue includes scheduled reminders when remindAt is due", () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        due: { remindAt: "2026-07-13T08:00", priority: "high", nudge: "Ping Bob" },
      })
    );
    const now = new Date("2026-07-13T09:00:00");
    const q = buildPromptQueue(
      [{ id: "due", summary: "Estimate follow-up", start: "2026-04-01T10:00" }],
      [],
      "2026-07-13",
      now
    );
    expect(q.some((x) => x.kind === "scheduled_reminder")).toBe(true);
  });

  it("snoozableQueueItems filters reminder kinds for batch snooze", () => {
    const q = [
      { kind: "must_today_nudge", event: { id: "a" } },
      { kind: "scheduled_reminder", event: { id: "b" } },
      { kind: "inspection", event: { id: "c" } },
    ];
    expect(snoozableQueueItems(q).map((x) => x.event.id)).toEqual(["a", "b"]);
  });

  it("isEventAllocated blocks past-week popup when next step or reminder is set", () => {
    const now = new Date("2026-07-13T09:00:00");
    allocateNextStep("ev-step", "create_estimate");
    expect(isEventAllocated(loadState(), "ev-step", now)).toBe(true);
    allocateReminderTime("ev-time", "2026-07-15T10:00", { note: "follow up" });
    expect(isEventAllocated(loadState(), "ev-time", now)).toBe(true);
    expect(serviceCallCandidates([{ id: "ev-time", summary: "Service call — Bob", start: "2026-07-08T10:00" }], [], "2026-07-13", now)).toHaveLength(0);
  });

  it("allocateReminderTime clears next step and fires when due", () => {
    allocateNextStep("ev1", "create_estimate");
    allocateReminderTime("ev1", "2026-07-13T08:00", { nudge: "Ping Bob", priority: "high" });
    const raw = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(raw.ev1.nextStepAt).toBeFalsy();
    expect(raw.ev1.remindAt).toBe("2026-07-13T08:00");
    const now = new Date("2026-07-13T09:00:00");
    const hits = dueScheduledReminders([{ id: "ev1", summary: "Bob", start: "2026-07-01T10:00" }], [], "2026-07-13", now);
    expect(hits).toHaveLength(1);
    expect(serviceCallCandidates([{ id: "ev1", summary: "Service call — Bob", start: "2026-07-01T10:00" }], [], "2026-07-13", now)).toHaveLength(0);
  });

  it("prompt work pause suppresses while active and clears after idle or max", () => {
    const start = new Date("2026-07-13T10:00:00").getTime();
    beginPromptWorkPause(start);
    expect(shouldSuppressPrompts(start + 1000)).toBe(true);
    expect(shouldSuppressPrompts(start + PROMPT_IDLE_MS - 1000)).toBe(true);
    expect(shouldSuppressPrompts(start + PROMPT_IDLE_MS + 1000)).toBe(false);

    beginPromptWorkPause(start);
    touchPromptActivity(start + 120_000);
    expect(shouldSuppressPrompts(start + 150_000)).toBe(true);
    expect(shouldSuppressPrompts(start + 190_000)).toBe(false);

    beginPromptWorkPause(start);
    touchPromptActivity(start + PROMPT_WORK_PAUSE_MS - 2000);
    expect(shouldSuppressPrompts(start + PROMPT_WORK_PAUSE_MS - 1000)).toBe(true);
    expect(shouldSuppressPrompts(start + PROMPT_WORK_PAUSE_MS + 1000)).toBe(false);
    clearPromptWorkPause();
    expect(shouldSuppressPrompts()).toBe(false);
  });

  it("allocateNextStep clears future reminder and blocks service-call queue", () => {
    allocateReminderTime("ev2", "2026-07-20T10:00");
    allocateNextStep("ev2", "create_job");
    const raw = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(raw.ev2.remindAt).toBeFalsy();
    expect(raw.ev2.nextStepKey).toBe("create_job");
    const now = new Date("2026-07-13T09:00:00");
    expect(serviceCallCandidates([{ id: "ev2", summary: "Service call — Jane", start: "2026-07-10T10:00" }], [], "2026-07-13", now)).toHaveLength(0);
  });
});

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}