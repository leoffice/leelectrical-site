import { describe, expect, it } from "vitest";
import {
  jobCalendarLinkState,
  parseCalendarUpsertResult,
  withJobLink,
} from "../src/lib/calendarLink.js";
import { paperworkPillTone } from "../src/lib/paperwork.js";

describe("calendar link state", () => {
  const job = { id: "J-1", calEventId: "" };
  const events = [];

  it("parses calendar_upsert result eventId", () => {
    expect(parseCalendarUpsertResult(JSON.stringify({ eventId: "abc123" }))?.eventId).toBe("abc123");
  });

  it("pending while calendar_upsert is queued", () => {
    const st = jobCalendarLinkState(
      { ...job, calEventId: "pending-99" },
      [
        {
          id: "pending-99",
          summary: "Inspection",
          start: "2099-01-01T09:00",
          description: withJobLink("Created in LE Pro", "J-1"),
        },
      ],
      [{ type: "calendar_upsert", jobId: "J-1", status: "working" }]
    );
    expect(st.pending).toBe(true);
    expect(st.confirmed).toBe(false);
    expect(paperworkPillTone({ step: "Inspection appointment", hasDate: true, isInspection: true, calendarConfirmed: st.confirmed, calendarPending: st.pending })).toBe("orange");
  });

  it("confirmed green when calendar_upsert is done", () => {
    const st = jobCalendarLinkState(
      { ...job, calEventId: "pending-99" },
      [],
      [
        {
          type: "calendar_upsert",
          jobId: "J-1",
          status: "done",
          result: JSON.stringify({ eventId: "google-ev-1" }),
        },
      ]
    );
    expect(st.confirmed).toBe(true);
    expect(st.pending).toBe(false);
    expect(paperworkPillTone({ step: "Inspection appointment", hasDate: true, isInspection: true, calendarConfirmed: st.confirmed, calendarPending: st.pending })).toBe("green");
  });

  it("red when inspection date set but no appointment", () => {
    const st = jobCalendarLinkState(job, events, []);
    expect(st.confirmed).toBe(false);
    expect(st.pending).toBe(false);
    expect(paperworkPillTone({ step: "Inspection appointment", hasDate: true, isInspection: true, calendarConfirmed: st.confirmed, calendarPending: st.pending })).toBe("red");
  });
});