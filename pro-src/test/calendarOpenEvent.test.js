// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeCalendarPick,
  findEventForInsight,
  stashCalendarPick,
} from "../src/lib/calendarNavigate.js";
import { isInspectionEvent, eventChipClassName, GCAL_RED_COLOR_ID } from "../src/lib/calendarEventStyle.js";
import { weekOffsetForDate, mondayOf, ymd } from "../src/lib/calendarWeek.js";

describe("open schedule calendar → event", () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("findEventForInsight prefers job calEventId", () => {
    const events = [
      { id: "ev-other", summary: "Other", start: "2026-08-15T14:00" },
      { id: "ev-insp", summary: "Inspection appointment · 2:00 PM", start: "2026-08-15T14:00", colorId: "11" },
    ];
    const hit = findEventForInsight(
      { dateTime: "2026-08-15T14:00", appointmentType: "inspection" },
      { calEventId: "ev-insp" },
      events
    );
    expect(hit?.id).toBe("ev-insp");
  });

  it("findEventForInsight uses appliedEventId then same-time match", () => {
    const events = [{ id: "pending-9", summary: "Inspection", start: "2026-08-15T14:00", colorId: "11" }];
    expect(
      findEventForInsight({ dateTime: "2026-08-15T14:00", appliedEventId: "pending-9" }, null, events)?.id
    ).toBe("pending-9");
    expect(findEventForInsight({ dateTime: "2026-08-15T14:00" }, null, events)?.id).toBe("pending-9");
  });

  it("stashCalendarPick survives for Today consume", () => {
    stashCalendarPick("ev-99");
    expect(consumeCalendarPick()).toBe("ev-99");
    expect(consumeCalendarPick()).toBe("");
  });
});

describe("inspection light translucent red", () => {
  it("detects colorId 11 and inspection titles", () => {
    expect(isInspectionEvent({ colorId: GCAL_RED_COLOR_ID, summary: "X" })).toBe(true);
    expect(isInspectionEvent({ summary: "Inspection appointment · 9:30 AM" })).toBe(true);
    expect(isInspectionEvent({ summary: "Estimate — Jane" })).toBe(false);
  });

  it("chip class uses translucent red for inspections", () => {
    const cls = eventChipClassName({ summary: "Inspection", colorId: "11" }, { selected: false });
    expect(cls).toMatch(/bg-red-500\/15/);
    expect(cls).not.toMatch(/bg-red-600/);
  });

  it("selected inspection keeps translucent red + ring", () => {
    const cls = eventChipClassName({ summary: "Inspection", colorId: "11" }, { selected: true });
    expect(cls).toMatch(/bg-red-500\/15/);
    expect(cls).toMatch(/ring-2/);
  });
});

describe("weekOffsetForDate", () => {
  it("returns 0 for a day in the current work week", () => {
    const mon = mondayOf(new Date("2026-07-10T12:00:00"));
    expect(weekOffsetForDate(ymd(mon), mon)).toBe(0);
  });

  it("returns 1 for next week", () => {
    const mon = mondayOf(new Date("2026-07-06T12:00:00"));
    expect(weekOffsetForDate("2026-07-13", mon)).toBe(1);
  });
});
