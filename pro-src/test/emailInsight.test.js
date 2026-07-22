import { describe, expect, it } from "vitest";
import {
  parseEmailInsight,
  matchJobForInsight,
  buildProposedActions,
  enrichInsight,
  isEnergyServicesEmail,
  isCityDobEmail,
  classifyAgency,
  extractAddress,
  extractDateTime,
  extractDobJobNumber,
  extractTimeWindow,
  floorToHalfHour,
  resolveScheduleTimes,
  buildAppointmentDescription,
  classifyAppointmentType,
  classifyEmailOutcome,
  canAutoApply,
  wantsNewCalendarAppointment,
  defaultActionKeys,
  stripHtml,
  formatAppliedLead,
  formatInsightDateLabel,
  formatInsightTimeLabel,
  formatInsightHoursLabel,
  formatInsightSourceLabel,
  isDateTimeActionable,
  isPastAppointmentInsight,
  hasRealInsightData,
  shouldSurfaceInsight,
  EMAIL_INSIGHT_TEST_AUTO_APPLY_LIMIT,
  APPOINTMENT_DURATION_MINUTES,
} from "../src/lib/emailInsight.js";
import {
  buildCalendarPayload,
  ensureInspectionSelections,
  calendarTitleForInsight,
  applyEmailInsight,
  cancelEmailInsightAppointment,
} from "../src/lib/applyEmailInsight.js";

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

const DOB_CITY_BODY = `The Department of Buildings has scheduled an Electrical Inspection on 7/30/2026 10:15 AM at 149,EAST 116 STREET,Manhattan,10029 for Job Number M01228312.
If there is an immediate need to cancel this scheduled inspection, log into DOB NOW: Inspections.`;

describe("emailInsight", () => {
  it("detects Energy Services and City DOB senders", () => {
    expect(isEnergyServicesEmail("noreply@energy-services.com", "Appointment", "")).toBe(true);
    expect(isEnergyServicesEmail("alerts@coned.com", "Inspection", "")).toBe(true);
    expect(isEnergyServicesEmail("CPMS.noreply@coned.com", "Case", "")).toBe(true);
    expect(isEnergyServicesEmail("dobnowdonotreply@buildings.nyc.gov", "Electrical Inspection Scheduled", "")).toBe(
      true
    );
    expect(isCityDobEmail("dobnowdonotreply@buildings.nyc.gov", "Electrical Inspection Scheduled", "")).toBe(true);
    expect(classifyAgency("dobnowdonotreply@buildings.nyc.gov", "Electrical Inspection Scheduled", "")).toBe("city");
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
    // DOB "how to cancel" footer must NOT mark a real scheduled email as cancelled
    // (this was looping the Smart Suggestion sheet every login).
    expect(
      classifyEmailOutcome(
        "Electrical Inspection Scheduled - Job Number M01228312/I1 /149 EAST  116 STREET",
        DOB_CITY_BODY +
          " If there is an immediate need to cancel this scheduled inspection, log into DOB NOW: Inspections+ to submit your cancellation request at least 48 hours prior to the scheduled inspection."
      )
    ).toBe("scheduled");
    expect(classifyEmailOutcome("Your appointment is cancelled", "Your appointment is cancelled.")).toBe("cancelled");
  });

  it("re-enriches wrong stored cancelled outcome from DOB footer text", () => {
    const jobs = [
      {
        id: "qbo-est-25435",
        customer: "Arthur",
        serviceAddress: "149 East 116 Street, Manhattan, NY 10029",
      },
    ];
    const stuck = {
      id: "ei-stuck",
      status: "pending",
      outcome: "cancelled", // bad store value from old classifier
      appointmentType: "inspection",
      agency: "city",
      dateTime: "2026-07-30T10:00",
      address: "149 East 116 Street, Manhattan, NY 10029",
      summary: "at 149 East 116 Street … (cancelled)",
      source: {
        subject: "Electrical Inspection Scheduled - Job Number M01228312",
        from: "dobnowdonotreply@buildings.nyc.gov",
      },
      emailSnippet: DOB_CITY_BODY + " submit your cancellation request at least 48 hours prior",
    };
    const enriched = enrichInsight(stuck, jobs);
    expect(enriched.outcome).toBe("scheduled");
    // New sets never auto-apply — Levi must Approve first.
    expect(enriched.canAutoApply).toBe(false);
    expect(enriched.summary).not.toMatch(/\(cancelled\)/i);
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
    // Strong match still waits for Approve before creating a calendar event.
    expect(enriched.canAutoApply).toBe(false);
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

  it("never auto-creates calendar appointments — new sets need Approve (Levi 2026-07-22)", () => {
    const job = { id: "J-99", customer: "Jane", serviceAddress: "503 Schenectady Ave" };
    const good = enrichInsight(
      parseEmailInsight({ from: "coned.com", subject: "Inspection scheduled", body: SAMPLE_BODY }),
      [job]
    );
    expect(good.outcome).toBe("scheduled");
    // Offer calendar on approve sheet, but do not silent-create.
    expect(canAutoApply(good, job)).toBe(false);
    expect(defaultActionKeys(good, job)).toContain("calendar");
    expect(wantsNewCalendarAppointment(good)).toBe(true);

    // Reminder emails never auto-create calendar appointments.
    const reminder = enrichInsight(
      parseEmailInsight({
        from: "CPMS.noreply@coned.com",
        subject: "Initial Inspection Reminder",
        body: CONED_HTML_REMINDER,
      }),
      [{ id: "J-1", serviceAddress: "1127 Lincoln Pl" }]
    );
    expect(reminder.outcome).toBe("reminder");
    expect(canAutoApply(reminder, { id: "J-1", serviceAddress: "1127 Lincoln Pl" })).toBe(false);
    expect(wantsNewCalendarAppointment(reminder)).toBe(false);
    expect(defaultActionKeys(reminder, { id: "J-1" })).not.toContain("calendar");

    const weak = { ...good, jobMatchScore: 0.4 };
    expect(canAutoApply(weak, job)).toBe(false);

    const noDate = { ...good, dateTime: "", outcome: "scheduled" };
    expect(canAutoApply(noDate, job)).toBe(false);
  });

  it("never surfaces past-day appointment suggestions or reminders (Levi 2026-07-22)", () => {
    // Morning after a Jul 21 Con Ed inspection — same case as the screenshot.
    const morningAfter = new Date(2026, 6, 22, 8, 32, 0); // Jul 22 local
    expect(isDateTimeActionable("2026-07-21T10:30", morningAfter)).toBe(false);
    expect(isDateTimeActionable("2026-07-22T10:30", morningAfter)).toBe(true);

    const pastReminder = {
      outcome: "reminder",
      dateTime: "2026-07-21T10:30",
      appointmentType: "inspection",
      agency: "coned",
      address: "503 SCHENECTADY AVE, BROOKLYN, NY 11203",
      source: { subject: "Con Edison Case Number MC-91013-Final Inspection Reminder", fromLabel: "Con Edison" },
    };
    expect(isPastAppointmentInsight(pastReminder, morningAfter)).toBe(true);
    expect(shouldSurfaceInsight(pastReminder, morningAfter)).toBe(false);
    expect(wantsNewCalendarAppointment(pastReminder, morningAfter)).toBe(false);
    expect(canAutoApply(pastReminder, { id: "J-1" }, morningAfter)).toBe(false);

    const pastScheduled = {
      outcome: "scheduled",
      dateTime: "2026-07-21T10:30",
      appointmentType: "inspection",
      jobMatchScore: 0.95,
    };
    expect(isPastAppointmentInsight(pastScheduled, morningAfter)).toBe(true);
    expect(shouldSurfaceInsight(pastScheduled, morningAfter)).toBe(false);
    expect(wantsNewCalendarAppointment(pastScheduled, morningAfter)).toBe(false);
    expect(canAutoApply(pastScheduled, { id: "J-1" }, morningAfter)).toBe(false);
    expect(buildProposedActions(pastScheduled, { id: "J-1" }, morningAfter).some((a) => a.key === "calendar")).toBe(
      false
    );

    // Same-day appointment still surfaces.
    const todayReminder = { ...pastReminder, dateTime: "2026-07-22T10:30" };
    expect(isPastAppointmentInsight(todayReminder, morningAfter)).toBe(false);
    expect(shouldSurfaceInsight(todayReminder, morningAfter)).toBe(true);

    // Completed paperwork updates still surface even when the date is past.
    const completed = {
      outcome: "completed",
      dateTime: "2026-07-21T10:30",
      appointmentType: "inspection",
      address: "503 SCHENECTADY AVE, BROOKLYN, NY 11203",
      source: { subject: "Final Inspection Appointment Completed", fromLabel: "Con Edison" },
      emailSnippet: "Your Final Inspection passed on Tuesday, July 21, 2026.",
    };
    expect(isPastAppointmentInsight(completed, morningAfter)).toBe(false);
    expect(hasRealInsightData(completed)).toBe(true);
    expect(shouldSurfaceInsight(completed, morningAfter)).toBe(true);
  });

  it("never surfaces vague / junk email insights without real facts (Levi 2026-07-22)", () => {
    // Screenshot case: subject "x", no address, no date — still proposed calendar add.
    const junkX = {
      outcome: "other",
      appointmentType: "other",
      agency: "coned",
      address: "",
      dateTime: "",
      jobId: null,
      jobMatchScore: 0,
      source: { subject: "x", fromLabel: "Con Edison", type: "email" },
      emailSnippet: "x",
    };
    expect(hasRealInsightData(junkX)).toBe(false);
    expect(shouldSurfaceInsight(junkX)).toBe(false);
    expect(buildProposedActions(junkX, null).some((a) => a.key === "calendar")).toBe(false);

    // Has Con Ed-ish subject but still no address or date.
    const emptyFacts = {
      outcome: "scheduled",
      appointmentType: "other",
      agency: "coned",
      address: "",
      dateTime: "",
      source: {
        subject: "Energy Services appointment",
        fromLabel: "Con Edison",
        type: "email",
      },
      emailSnippet: "From Con Edison: for Energy Services appointment.",
    };
    expect(hasRealInsightData(emptyFacts)).toBe(false);
    expect(shouldSurfaceInsight(emptyFacts)).toBe(false);

    // Address only, no date → still not actionable for a calendar set.
    const addrNoDate = {
      outcome: "scheduled",
      appointmentType: "inspection",
      agency: "coned",
      address: "503 Schenectady Ave, Brooklyn, NY 11203",
      dateTime: "",
      source: { subject: "Inspection scheduled", fromLabel: "Con Edison" },
      emailSnippet: "Service Address 503 SCHENECTADY AVE BROOKLYN NY 11203",
    };
    expect(hasRealInsightData(addrNoDate)).toBe(false);
    expect(shouldSurfaceInsight(addrNoDate)).toBe(false);

    // Real: address + date + meaningful content.
    const real = {
      outcome: "scheduled",
      appointmentType: "inspection",
      agency: "coned",
      address: "503 Schenectady Ave, Brooklyn, NY 11203",
      dateTime: "2026-08-15T14:00",
      source: {
        subject: "Con Edison inspection scheduled",
        fromLabel: "Con Edison",
      },
      emailSnippet:
        "Energy Services has scheduled a Con Edison inspection for 503 Schenectady Avenue on August 15, 2026 at 2:00 PM.",
    };
    expect(hasRealInsightData(real)).toBe(true);
    expect(shouldSurfaceInsight(real, new Date(2026, 6, 22))).toBe(true);

    // Real completed with address only (date may be past — paperwork still useful).
    const completedOk = {
      outcome: "completed",
      appointmentType: "inspection",
      address: "1127 Lincoln Pl, Brooklyn, NY 11213",
      dateTime: "2026-07-21T09:30",
      source: { subject: "Final Inspection Appointment Completed" },
      emailSnippet: "Your Final Inspection passed.",
    };
    expect(hasRealInsightData(completedOk)).toBe(true);

    // Stub subject with short content rejected.
    expect(
      hasRealInsightData({
        outcome: "other",
        address: "503 Schenectady Ave",
        dateTime: "2026-08-01T10:00",
        source: { subject: "test" },
        emailSnippet: "test",
      })
    ).toBe(false);
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

  it("formatAppliedLead is plain for calendar add and already-on-calendar", () => {
    const job = { id: "J-1", customer: "Izzy" };
    const insight = {
      outcome: "scheduled",
      appointmentType: "inspection",
      agency: "coned",
      dateTime: "2026-07-28T09:30",
      endDateTime: "2026-07-28T10:30",
      source: { fromLabel: "Con Edison", type: "email" },
    };
    expect(formatAppliedLead(insight, job)).toMatch(/Izzy/);
    expect(formatAppliedLead(insight, job)).toMatch(/schedule calendar/);
    expect(formatAppliedLead(insight, job)).toMatch(/Jul/);
    expect(formatAppliedLead(insight, job)).toMatch(/9:30/);
    expect(
      formatAppliedLead({ ...insight, skipReason: "already_on_calendar" }, job)
    ).toMatch(/already on your schedule/i);
    expect(
      formatAppliedLead({ ...insight, outcome: "reminder" }, job)
    ).toMatch(/reminder only/i);
    expect(
      formatAppliedLead({ ...insight, outcome: "reminder" }, job)
    ).toMatch(/9:30/);
  });

  it("formats notice date, hours, and source for the calendar card", () => {
    expect(formatInsightDateLabel("2026-07-08T14:00")).toMatch(/Jul/);
    expect(formatInsightDateLabel("2026-07-08T14:00")).toMatch(/8/);
    expect(formatInsightDateLabel("2026-07-08T14:00")).toMatch(/2026/);
    expect(formatInsightTimeLabel("2026-07-08T14:00")).toBe("2:00 PM");
    expect(formatInsightTimeLabel("2026-07-08T09:30")).toBe("9:30 AM");
    const insight = {
      dateTime: "2026-07-08T09:30",
      endDateTime: "2026-07-08T10:30",
      source: { type: "email", fromLabel: "Con Edison" },
    };
    expect(formatInsightHoursLabel(insight)).toBe("9:30 AM – 10:30 AM");
    expect(formatInsightSourceLabel(insight)).toBe("Email · Con Edison");
    // Event start wins over insight when opening "already on calendar"
    expect(
      formatInsightHoursLabel(insight, { start: "2026-07-08T11:00", end: "2026-07-08T12:00" })
    ).toBe("11:00 AM – 12:00 PM");
  });

  it("parses City DOB electrical inspection email", () => {
    const raw = parseEmailInsight({
      from: "DOBNOW donotreply <dobnowdonotreply@buildings.nyc.gov>",
      subject: "Electrical Inspection Scheduled - Job Number M01228312/I1 /149 EAST 116 STREET",
      body: DOB_CITY_BODY,
      messageId: "dob-msg-1",
    });
    expect(raw.agency).toBe("city");
    expect(raw.outcome).toBe("scheduled");
    expect(raw.appointmentType).toBe("inspection");
    expect(raw.address).toMatch(/149/i);
    expect(raw.address).toMatch(/116/i);
    expect(raw.address).toMatch(/10029|Manhattan/i);
    expect(raw.dateTime).toBe("2026-07-30T10:00"); // floored from 10:15
    expect(raw.exactDateTime).toBe("2026-07-30T10:15");
    expect(extractDobJobNumber(DOB_CITY_BODY)).toMatch(/M01228312/i);
    expect(raw.dobJobNumber).toMatch(/M01228312/i);
    expect(raw.source.fromLabel).toMatch(/DOB|City/i);

    const jobs = [{ id: "J-city", customer: "East 116", serviceAddress: "149 East 116 Street, Manhattan" }];
    const enriched = enrichInsight(raw, jobs);
    expect(enriched.jobId).toBe("J-city");
    expect(canAutoApply(enriched, jobs[0])).toBe(false);
    expect(defaultActionKeys(enriched, jobs[0])).toContain("calendar");

    const title = calendarTitleForInsight(enriched);
    expect(title).toMatch(/City electrical/i);
    expect(title).toMatch(/10:00/);
    expect(title).not.toMatch(/Jul|July|30/);

    const desc = buildAppointmentDescription(enriched, jobs[0]);
    expect(desc).toMatch(/10:15/);
    expect(desc).toMatch(/City|DOB|Buildings/i);
    expect(desc).toMatch(/M01228312/);
    expect(desc).not.toMatch(/leJobId/i);
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
    // Levi 2026-07-22: BTWN + a.m./p.m. (cross-noon shows both).
    expect(w.text).toMatch(/BTWN/i);
    expect(w.text).toMatch(/11:00/);
    expect(w.text).toMatch(/1:00/);
  });

  it("3-hour window classifies as meter installation (Con Ed Appointments)", () => {
    const body = `Dear Chanan Sheleg,
Your appointment for electric service repair/installation at 503 SCHENECTADY AVE, BROOKLYN 11203
has been scheduled for August 4, 2026. Appointment set between 8:00 and 11:00.`;
    const raw = parseEmailInsight({
      from: "Con Edison Appointments <Appointments@coned.com>",
      subject: "Your Con Edison appointment | APPT-721826",
      body,
      messageId: "appt-721826",
    });
    expect(raw.appointmentType).toBe("meter_installation");
    expect(raw.timeWindow?.startHour).toBe(8);
    expect(raw.timeWindow?.endHour).toBe(11);
    expect(raw.timeWindow?.text).toMatch(/BTWN 8:00 and 11:00 a\.m\./i);
    expect(raw.dateTime).toMatch(/T08:00/);
    const job = {
      id: "J-chanan",
      customer: "Chanan Sheleg",
      email: "hanan770@gmail.com",
      phone: "718-555-0100",
      serviceAddress: "503 Schenectady Ave, Brooklyn, NY 11203",
    };
    const title = calendarTitleForInsight(raw);
    expect(title).toMatch(/Meter installation/i);
    expect(title).toMatch(/8:00/);
    expect(title).not.toMatch(/^appointment$/i);
    const desc = buildAppointmentDescription(raw, job);
    expect(desc).toMatch(/Customer: Chanan Sheleg/);
    expect(desc).toMatch(/Phone:/);
    expect(desc).toMatch(/Email: hanan770@gmail.com/);
    expect(desc).toMatch(/meter installation/i);
    expect(desc).toMatch(/BTWN 8:00 and 11:00 a\.m\./i);
    expect(desc).not.toMatch(/leJobId/i);
    const payload = buildCalendarPayload(raw, job, ensureInspectionSelections(raw, job, new Set(["calendar"])));
    expect(payload.summary).toMatch(/Meter installation/i);
    expect(payload.description).toMatch(/BTWN/i);
    expect(payload.reminders.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([60, 1440]);
  });

  it("window appointment schedules start of window for 1 hour", () => {
    const body = `Service Address 1127 Lincoln Pl Brooklyn
Your appointment is between 11:00 and 1:00 on July 28, 2026.`;
    const sched = resolveScheduleTimes(body);
    expect(sched.timeWindow?.text).toMatch(/BTWN/i);
    expect(sched.timeWindow?.text).toMatch(/11:00/);
    expect(sched.timeWindow?.text).toMatch(/1:00/);
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
      agency: "coned",
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
    expect(payload.description).toMatch(/Jane|Customer/i);
    expect(payload.location).toMatch(/503 Schenectady/i);
    expect(payload.location).toMatch(/Brooklyn|11203/i);
    expect(payload.reminders.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([60, 1440]);
    expect(payload.guests).toEqual(["j@x.com"]);
    expect(payload.notifyCustomer).toBe(true);
    expect(payload.description).toMatch(/11:15/);
    expect(payload.description).toMatch(/inspection|Con Edison|Energy/i);
  });

  it("skips calendar create when appointment already on the calendar", async () => {
    const insight = enrichInsight(
      parseEmailInsight({
        from: "noreply@energy-services.com",
        subject: "Inspection scheduled",
        body: SAMPLE_BODY,
        messageId: "already-there",
      }),
      [{ id: "J-99", customer: "Jane", serviceAddress: "503 Schenectady Ave", email: "j@x.com" }]
    );
    const job = {
      id: "J-99",
      customer: "Jane",
      serviceAddress: "503 Schenectady Ave",
      email: "j@x.com",
      calEventId: "ev-existing",
    };
    const events = [
      {
        id: "ev-existing",
        summary: "Con Edison appointment — 2:00 PM",
        start: "2026-08-15T14:00:00",
        location: "503 Schenectady Ave",
      },
    ];
    const enqueued = [];
    const patches = [];
    await applyEmailInsight({
      insight,
      job,
      selectedActionKeys: defaultActionKeys(insight, job),
      enqueue: async (type, jobId, payload) => {
        enqueued.push({ type, jobId, payload });
      },
      patchAndSave: async () => {},
      patchEmailInsight: async (id, patch) => {
        patches.push({ id, patch });
      },
      appendLocalEvent: () => {},
      pullCalendarNow: () => {},
      showToast: null,
      autoApply: true,
      events,
    });
    expect(enqueued.filter((e) => e.type === "calendar_upsert")).toHaveLength(0);
    expect(patches[0]?.patch?.skipReason).toBe("already_on_calendar");
    expect(patches[0]?.patch?.appliedEventId).toBe("ev-existing");
  });

  it("test auto-apply limit is one appointment", () => {
    expect(EMAIL_INSIGHT_TEST_AUTO_APPLY_LIMIT).toBe(1);
  });

  it("Ignore and cancel deletes the existing calendar appointment", async () => {
    const insight = {
      id: "ei-cancel-1",
      outcome: "scheduled",
      appointmentType: "inspection",
      agency: "coned",
      dateTime: "2026-08-15T14:00",
      address: "503 Schenectady Ave",
      appliedEventId: "ev-to-kill",
    };
    const job = {
      id: "J-99",
      customer: "Jane",
      serviceAddress: "503 Schenectady Ave",
      calEventId: "ev-to-kill",
    };
    const events = [
      {
        id: "ev-to-kill",
        summary: "Con Edison inspection — 2:00 PM",
        start: "2026-08-15T14:00:00",
        location: "503 Schenectady Ave",
      },
    ];
    const enqueued = [];
    const patches = [];
    const removed = [];
    const jobPatches = [];
    const result = await cancelEmailInsightAppointment({
      insight,
      job,
      events,
      enqueue: async (type, jobId, payload) => {
        enqueued.push({ type, jobId, payload });
      },
      patchAndSave: async (id, patch) => {
        jobPatches.push({ id, patch });
      },
      patchEmailInsight: async (id, patch) => {
        patches.push({ id, patch });
      },
      removeLocalEvent: (id) => removed.push(id),
      pullCalendarNow: () => {},
      showToast: () => {},
    });
    expect(result.cancelled).toBe(true);
    expect(enqueued).toEqual([
      { type: "calendar_delete", jobId: "J-99", payload: { calEventId: "ev-to-kill" } },
    ]);
    expect(removed).toEqual(["ev-to-kill"]);
    expect(jobPatches[0]?.patch?.calEventId).toBe("");
    expect(patches[0]?.patch?.status).toBe("ignored");
    expect(patches[0]?.patch?.ignoreReason).toBe("ignore_and_cancel");
  });

  it("Ignore and cancel with nothing on calendar just dismisses", async () => {
    const insight = {
      id: "ei-cancel-2",
      outcome: "scheduled",
      dateTime: "2026-08-20T10:00",
      address: "999 Nowhere St",
    };
    const patches = [];
    const enqueued = [];
    const result = await cancelEmailInsightAppointment({
      insight,
      job: null,
      events: [],
      enqueue: async (type, jobId, payload) => enqueued.push({ type, jobId, payload }),
      patchAndSave: async () => {},
      patchEmailInsight: async (id, patch) => patches.push({ id, patch }),
      removeLocalEvent: () => {},
      showToast: () => {},
    });
    expect(result.cancelled).toBe(false);
    expect(enqueued).toHaveLength(0);
    expect(patches[0]?.patch?.status).toBe("ignored");
    expect(patches[0]?.patch?.ignoreReason).toBe("ignored");
  });
});
