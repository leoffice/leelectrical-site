/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  STATE_KEY,
  buildPromptQueue,
  dismissEventReminders,
  generateReminderNudge,
  inspectionCandidates,
  isInspectionEvent,
  isServiceCallEvent,
  pickFirmerNudge,
  rescheduleEventReminder,
  scheduleSameDayPushOff,
  serviceCallCandidates,
  validateRemindDatetime,
  suggestJobsForEvent,
} from "../src/lib/followUpReminders.js";
import { consumeCalendarPick, stashCalendarPick } from "../src/lib/calendarNavigate.js";
import {
  isDaySelectable,
  monthGrid,
  workHourSlots,
} from "../src/lib/reminderPicker.js";

const today = "2026-07-10";

beforeEach(() => {
  localStorage.removeItem(STATE_KEY);
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
      { id: "svc", summary: "Service call — Bob", start: "2026-07-09T10:00" },
      { id: "insp", summary: "Inspection — site", start: "2026-07-10T09:00" },
    ];
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        svc: { priority: "must_today", remindAt: "2026-07-10T09:00", pushOffCount: 1, nextNudgeAt: "2026-07-10T08:00" },
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

  it("suggestJobsForEvent matches customer and address", () => {
    const event = { id: "e1", summary: "Peretz Chein — panel", location: "12 Main St", start: "2026-07-09T10:00" };
    const jobs = [
      { id: "J-1", customer: "Peretz Chein", address: "12 Main St, Brooklyn" },
      { id: "J-2", customer: "Other", address: "99 Oak" },
    ];
    expect(suggestJobsForEvent(event, jobs).map((j) => j.id)).toEqual(["J-1"]);
  });
});