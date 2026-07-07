import { describe, expect, it } from "vitest";
import { eventsForWorkWeek, mondayOf, workWeekDays, ymd } from "../src/lib/calendarWeek.js";

describe("calendarWeek", () => {
  it("mondayOf lands on Monday for a Wednesday", () => {
    expect(ymd(mondayOf("2026-07-08"))).toBe("2026-07-06");
  });

  it("workWeekDays returns Mon–Fri", () => {
    const days = workWeekDays(mondayOf("2026-07-10"));
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(days[4].key).toBe("2026-07-10");
  });

  it("eventsForWorkWeek buckets by day and skips inspections", () => {
    const { byDay } = eventsForWorkWeek(
      [
        { id: "a", summary: "Estimate — Jane", start: "2026-07-10T10:00" },
        { id: "b", summary: "Inspection — DOB", start: "2026-07-08T09:00" },
        { id: "c", summary: "Other", start: "2026-07-07T14:00" },
      ],
      mondayOf("2026-07-10")
    );
    expect(byDay["2026-07-10"]).toHaveLength(1);
    expect(byDay["2026-07-08"]).toHaveLength(0);
    expect(byDay["2026-07-07"]).toHaveLength(1);
  });
});