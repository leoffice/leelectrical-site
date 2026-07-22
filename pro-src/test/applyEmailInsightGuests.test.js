import { describe, it, expect } from "vitest";
import { buildCalendarPayload } from "../src/lib/applyEmailInsight.js";

describe("buildCalendarPayload guest email split", () => {
  it("splits comma-separated job emails into separate Google guests", () => {
    const insight = {
      appointmentType: "inspection",
      agency: "city",
      dateTime: "2026-07-30T10:00",
      endDateTime: "2026-07-30T11:00",
      address: "149 East 116 Street",
      outcome: "scheduled",
    };
    const job = {
      customer: "Arthur koptiv",
      email: "Arthurkoptiev@gmail.com,Gabrieldevelopment@gmail.com",
      serviceAddress: "149 E 116th St",
    };
    const sel = new Set(["calendar", "guest_email", "calendar_location", "remind_1h", "remind_1d"]);
    const payload = buildCalendarPayload(insight, job, sel);
    expect(payload.guests).toEqual([
      "Arthurkoptiev@gmail.com",
      "Gabrieldevelopment@gmail.com",
    ]);
    expect(payload.attendees).toEqual(payload.guests);
  });
});
