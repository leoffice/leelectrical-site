/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  STATE_KEY,
  buildPromptQueue,
  inspectionCandidates,
  isInspectionEvent,
  isServiceCallEvent,
  pickFirmerNudge,
  scheduleSameDayPushOff,
  serviceCallCandidates,
  validateRemindDatetime,
  suggestJobsForEvent,
} from "../src/lib/followUpReminders.js";

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

  it("suggestJobsForEvent matches customer and address", () => {
    const event = { id: "e1", summary: "Peretz Chein — panel", location: "12 Main St", start: "2026-07-09T10:00" };
    const jobs = [
      { id: "J-1", customer: "Peretz Chein", address: "12 Main St, Brooklyn" },
      { id: "J-2", customer: "Other", address: "99 Oak" },
    ];
    expect(suggestJobsForEvent(event, jobs).map((j) => j.id)).toEqual(["J-1"]);
  });
});