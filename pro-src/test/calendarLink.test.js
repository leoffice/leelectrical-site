import { describe, expect, it } from "vitest";
import {
  eventForJob,
  googleCalendarOpenUrl,
  isCalendarUnlinkCommand,
  jobCalendarLinkState,
  parseCalendarUpsertResult,
  searchCalendarEvents,
  suggestAppointmentsForJob,
  suggestJobsForEvent,
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

  it("stays unlinked after explicit unlink — ignores leJobId tag on other events", () => {
    const ev = {
      id: "ev-other",
      summary: "Service call",
      start: "2026-08-01T10:00",
      description: withJobLink("Other visit", "J-1"),
    };
    const unlinked = { ...job, _calUnlinked: true, calDismissedEventIds: ["ev-other"] };
    expect(eventForJob(unlinked, [ev])).toBe(null);
    const st = jobCalendarLinkState(unlinked, [ev], []);
    expect(st.confirmed).toBe(false);
    expect(st.pending).toBe(false);
  });

  it("detects calendar unlink commands", () => {
    expect(isCalendarUnlinkCommand({ idempotencyKey: "calunlink:abc" })).toBe(true);
    expect(isCalendarUnlinkCommand({ idempotencyKey: "callink:abc:J-1" })).toBe(false);
  });

  it("ignores stale link commands after explicit unlink", () => {
    const unlinked = { ...job, _calUnlinked: true, calEventId: "" };
    const st = jobCalendarLinkState(unlinked, [], [
      {
        type: "calendar_upsert",
        jobId: "J-1",
        status: "done",
        result: JSON.stringify({ eventId: "google-ev-1" }),
        idempotencyKey: "callink:google-ev-1:J-1",
      },
    ]);
    expect(st.confirmed).toBe(false);
    expect(st.pending).toBe(false);
  });

  it("searchCalendarEvents keeps appointments within the past year only", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const events = [
      { id: "old", summary: "Arthur Koptiv visit", start: "2024-03-15T10:00", location: "9 Oak" },
      { id: "new", summary: "Arthur Koptiv return", start: "2026-03-15T10:00", location: "9 Oak" },
    ];
    const hits = searchCalendarEvents(events, "arthur", now);
    expect(hits.map((e) => e.id)).toEqual(["new"]);
  });

  it("suggests jobs matching calendar event", () => {
    const events = [
      { id: "e1", summary: "Peretz Chein — panel", location: "12 Main St", start: "2026-03-01T10:00" },
    ];
    const jobs = [
      { id: "J-1", customer: "Peretz Chein", address: "12 Main St, Brooklyn" },
      { id: "J-2", customer: "Other", address: "99 Oak" },
    ];
    expect(suggestJobsForEvent(events[0], jobs).map((j) => j.id)).toEqual(["J-1"]);
  });

  it("suggests appointments matching customer or address", () => {
    const events = [
      { id: "e1", summary: "Peretz Chein — panel", location: "12 Main St", start: "2026-03-01T10:00" },
      { id: "e2", summary: "Other client", location: "99 Oak Ave", start: "2026-03-02T10:00" },
    ];
    const hits = suggestAppointmentsForJob(
      { customer: "Peretz Chein", address: "12 Main St, Brooklyn" },
      events
    );
    expect(hits.map((e) => e.id)).toEqual(["e1"]);
  });

  it("googleCalendarOpenUrl uses day view without event, event link when id present", () => {
    const day = googleCalendarOpenUrl({ dateYmd: "2026-07-10" });
    expect(day).toContain("2026/07/10");
    expect(day).toContain("office%40leelectrical.us");
    const ev = googleCalendarOpenUrl({ event: { id: "abc123", start: "2026-07-10T09:00" } });
    expect(ev).toContain("calendar/event");
    expect(ev).toContain("eid=");
  });
});