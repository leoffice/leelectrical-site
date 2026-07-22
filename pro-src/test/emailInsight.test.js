import { describe, expect, it } from "vitest";
import {
  parseEmailInsight,
  matchJobForInsight,
  buildProposedActions,
  enrichInsight,
  isEnergyServicesEmail,
  extractAddress,
  extractDateTime,
  extractTimeWindow,
  floorToHalfHour,
  resolveScheduleTimes,
  buildAppointmentDescription,
  classifyAppointmentType,
  classifyEmailOutcome,
  canAutoApply,
  defaultActionKeys,
  stripHtml,
  formatAppliedLead,
  EMAIL_INSIGHT_TEST_AUTO_APPLY_LIMIT,
  APPOINTMENT_DURATION_MINUTES,
} from "../src/lib/emailInsight.js";
import { buildCalendarPayload, ensureInspectionSelections } from "../src/lib/applyEmailInsight.js";

const SAMPLE_BODY = `Energy Services has scheduled a Con Edison inspection appointment
for 503 Schenectady Avenue on August 15, 2026 at 2:00 PM.
Please ensure access to the meter room.`;

const CONED_HTML_REMINDER = `<!DOCTYPE html><HTML><BODY>
<p><strong>Service Address</strong><br />1127  LINCOLN  PL  <br />BROOKLYN , NY 11213</p>
<p>Case Number : MC-936877</p>
Dear Levi Kumer,<br />
This is a friendly reminder of an upcoming Initial Inspection appointment on&nbsp;Jul 28, 2026&nbsp;at 9:30 AM .
</BODY></HTML>`;

const CONED_COMPLETED = `Service Address
503 SCHENECTADY AVE
BROOKLYN , NY 11203
Your Final Inspection passed on Tuesday, July 21, 2026.`;

describe("emailInsight", () => {
  it("detects Energy Services senders", () => {
    expect(isEnergyServicesEmail("noreply@energy-services.com", "Appointment", "")).toBe(true);
    expect(isEnergyServicesEmail("alerts@coned.com", "Inspection", "")).toBe(true);
    expect(isEnergyServicesEmail("CPMS.noreply@coned.com", "Case", "")).toBe(true);
    expect(isEnergyServicesEmail("bob@example.com", "Hello", "")).toBe(false);
  });

  it("parses address, datetime, and inspection type from sample email", () => {
    const raw = parseEmailInsight({
      from: "Energy Services <noreply@energy-services.com>",
      subject: "Con Edison inspection scheduled",
      body: SAMPLE_BODY,
      messageId: "msg-503",
    });
    expect(extractAddress(SAMPLE_BODY)).toContain("503 Schenectady");
    expect(classifyAppointmentType(SAMPLE_BODY)).toBe("inspection");
    expect(raw.source.fromLabel).toBe("Energy Services");
    expect(raw.appointmentType).toBe("inspection");
    expect(raw.address).toMatch(/503/i);
    expect(raw.dateTime).toMatch(/2026-08-15T14:00/);
    expect(raw.outcome).toBe("scheduled");
  });

  it("extractDateTime handles slash dates", () => {
    expect(extractDateTime("Appointment 7/20/2026")).toBe("2026-07-20T09:00");
  });

  it("strips Con Ed HTML and parses reminder date/address", () => {
    const plain = stripHtml(CONED_HTML_REMINDER);
    expect(plain).toMatch(/1127/i);
    expect(plain).toMatch(/Jul 28, 2026/i);
    expect(extractAddress(CONED_HTML_REMINDER)).toMatch(/1127/i);
    expect(extractDateTime(CONED_HTML_REMINDER)).toBe("2026-07-28T09:30");
    expect(classifyEmailOutcome("Initial Inspection Reminder", CONED_HTML_REMINDER)).toBe("reminder");
  });

  it("classifies completed vs cancelled outcomes", () => {
    expect(classifyEmailOutcome("Final Inspection Appointment Completed", CONED_COMPLETED)).toBe("completed");
    expect(classifyEmailOutcome("Initial Inspection Appointment Cancelled", "cancelled due to Cancelled by user")).toBe(
      "cancelled"
    );
    // Con Ed footer "Reschedule the appointment" must NOT mark the email cancelled.
    expect(
      classifyEmailOutcome(
        "Initial Inspection Scheduled",
        "Your Initial Inspection is scheduled on Jul 28, 2026 at 9:30 AM. Log in to Reschedule the appointment."
      )
    ).toBe("scheduled");
  });

  it("matches job by service address", () => {
    const insight = parseEmailInsight({
      from: "Energy Services",
      subject: "Inspection",
      body: SAMPLE_BODY,
    });
    const jobs = [
      { id: "J-99", customer: "Jane", serviceAddress: "503 Schenectady Ave, Brooklyn", address: "503 Schenectady Ave" },
      { id: "J-2", customer: "Other", address: "999 Different St" },
    ];
    const enriched = enrichInsight(insight, jobs);
    expect(enriched.jobId).toBe("J-99");
    expect(enriched.jobMatchScore).toBeGreaterThan(0.8);
    expect(enriched.lead).toMatch(/existing job/i);
    expect(enriched.proposedActions.some((a) => a.key === "calendar")).toBe(true);
    expect(enriched.proposedActions.some((a) => a.key === "paperwork_inspection")).toBe(true);
    expect(enriched.canAutoApply).toBe(true);
  });

  it("buildProposedActions includes reminders for inspections", () => {
    const insight = { appointmentType: "inspection", dateTime: "2026-08-15T14:00", address: "503 Schenectady Ave", outcome: "scheduled" };
    const job = { id: "J-1", customer: "Jane", email: "j@x.com" };
    const actions = buildProposedActions(insight, job);
    expect(actions.find((a) => a.key === "remind_1d")).toBeTruthy();
    expect(actions.find((a) => a.key === "guest_email")).toBeTruthy();
  });

  it("matchJobForInsight returns null when no good match", () => {
    const insight = { address: "123 Nowhere Lane" };
    const hit = matchJobForInsight(insight, [{ id: "J-1", address: "999 Other Rd" }]);
    expect(hit.jobId).toBeNull();
  });

  it("canAutoApply requires strong match + scheduleable date", () => {
    const job = { id: "J-99", customer: "Jane", serviceAddress: "503 Schenectady Ave" };
    const good = enrichInsight(
      parseEmailInsight({ from: "coned.com", subject: "Reminder", body: SAMPLE_BODY }),
      [job]
    );
    expect(canAutoApply(good, job)).toBe(true);
    expect(defaultActionKeys(good, job)).toContain("calendar");

    const weak = { ...good, jobMatchScore: 0.4 };
    expect(canAutoApply(weak, job)).toBe(false);

    const noDate = { ...good, dateTime: "", outcome: "scheduled" };
    expect(canAutoApply(noDate, job)).toBe(false);
  });

  it("canAutoApply completed inspection for paperwork; not cancelled", () => {
    const job = { id: "J-99", customer: "Chanan", serviceAddress: "503 Schenectady Ave" };
    const completed = enrichInsight(
      parseEmailInsight({
        from: "CPMS.noreply@coned.com",
        subject: "Final Inspection Appointment Completed",
        body: CONED_COMPLETED,
      }),
      [job]
    );
    expect(completed.outcome).toBe("completed");
    expect(canAutoApply(completed, job)).toBe(true);
    expect(defaultActionKeys(completed, job)).not.toContain("calendar");
    expect(defaultActionKeys(completed, job)).toContain("paperwork_inspection");

    const cancelled = enrichInsight(
      parseEmailInsight({
        from: "coned.com",
        subject: "Appointment Cancelled",
        body: "Service Address 1127 Lincoln Pl\nYour appointment is cancelled.",
      }),
      [{ id: "J-1", serviceAddress: "1127 Lincoln Pl" }]
    );
    expect(cancelled.outcome).toBe("cancelled");
    expect(canAutoApply(cancelled, { id: "J-1", serviceAddress: "1127 Lincoln Pl" })).toBe(false);
  });

  it("formatAppliedLead is plain for calendar add", () => {
    const job = { id: "J-1", customer: "Izzy" };
    const insight = {
      outcome: "reminder",
      appointmentType: "inspection",
      dateTime: "2026-07-28T09:30",
      source: { fromLabel: "Con Edison" },
    };
    expect(formatAppliedLead(insight, job)).toMatch(/Izzy/);
    expect(formatAppliedLead(insight, job)).toMatch(/schedule calendar/);
  });

  it("floors exact times to half-hour slots", () => {
    expect(floorToHalfHour("2026-08-15T11:15")).toBe("2026-08-15T11:00");
    expect(floorToHalfHour("2026-08-15T11:45")).toBe("2026-08-15T11:30");
    expect(floorToHalfHour("2026-08-15T11:00")).toBe("2026-08-15T11:00");
    expect(floorToHalfHour("2026-08-15T09:30")).toBe("2026-08-15T09:30");
  });

  it("extracts appointment windows between two clocks", () => {
    const w = extractTimeWindow("Appointment set between 11:00 and 1:00 on the service day.");
    expect(w).toBeTruthy();
    expect(w.startHour).toBe(11);
    expect(w.startMin).toBe(0);
    expect(w.endHour).toBe(13);
    expect(w.text).toMatch(/Appointment set between 11:00 and 1:00/);
  });

  it("window appointment schedules start of window for 1 hour", () => {
    const body = `Service Address 1127 Lincoln Pl Brooklyn
Your appointment is between 11:00 and 1:00 on July 28, 2026.`;
    const sched = resolveScheduleTimes(body);
    expect(sched.timeWindow?.text).toMatch(/between 11:00 and 1:00/);
    expect(sched.dateTime).toBe("2026-07-28T11:00");
    expect(sched.endDateTime).toBe("2026-07-28T12:00");
    expect(APPOINTMENT_DURATION_MINUTES).toBe(60);
  });

  it("inspection exact time lands in description; schedule uses half-hour", () => {
    const body = `Energy Services has scheduled a Con Edison inspection
for 503 Schenectady Avenue on August 15, 2026 at 11:15 AM.`;
    const raw = parseEmailInsight({
      from: "noreply@energy-services.com",
      subject: "Inspection scheduled",
      body,
      messageId: "msg-1115",
    });
    expect(raw.exactDateTime).toBe("2026-08-15T11:15");
    expect(raw.dateTime).toBe("2026-08-15T11:00");
    expect(raw.endDateTime).toBe("2026-08-15T12:00");
    const desc = buildAppointmentDescription(raw, { id: "J-1", email: "c@x.com" });
    expect(desc).toMatch(/11:15/);
    expect(desc).toMatch(/11:00/);
    expect(desc).toMatch(/half-hour/i);
  });

  it("buildCalendarPayload forces inspection reminders + guest + 1h slot, clean notes, full address", () => {
    const insight = {
      appointmentType: "inspection",
      dateTime: "2026-08-15T11:00",
      exactDateTime: "2026-08-15T11:15",
      endDateTime: "2026-08-15T12:00",
      address: "503 Schenectady Ave",
      outcome: "scheduled",
      timeWindow: null,
    };
    const job = {
      id: "J-1",
      customer: "Jane",
      email: "j@x.com",
      serviceAddress: "503 Schenectady Ave",
      billingAddress: "503 Schenectady Ave, Brooklyn, NY 11203",
    };
    const selected = ensureInspectionSelections(insight, job, new Set(["calendar"]));
    expect(selected.has("remind_1h")).toBe(true);
    expect(selected.has("remind_1d")).toBe(true);
    expect(selected.has("guest_email")).toBe(true);
    const payload = buildCalendarPayload(insight, job, selected);
    expect(payload.end).toBe("2026-08-15T12:00");
    expect(payload.durationMinutes).toBe(60);
    expect(payload.summary).toMatch(/11:00 AM|11:00/);
    expect(payload.summary).not.toMatch(/Aug|August|15/);
    expect(payload.description).not.toMatch(/leJobId/i);
    expect(payload.location).toMatch(/503 Schenectady/i);
    expect(payload.location).toMatch(/Brooklyn|11203/i);
    expect(payload.reminders.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([60, 1440]);
    expect(payload.guests).toEqual(["j@x.com"]);
    expect(payload.notifyCustomer).toBe(true);
    expect(payload.description).toMatch(/11:15/);
    expect(payload.description).toMatch(/Appointment|inspection|From Energy/i);
  });

  it("test auto-apply limit is one appointment", () => {
    expect(EMAIL_INSIGHT_TEST_AUTO_APPLY_LIMIT).toBe(1);
  });
});
