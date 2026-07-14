import { describe, expect, it } from "vitest";
import {
  parseEmailInsight,
  matchJobForInsight,
  buildProposedActions,
  enrichInsight,
  isEnergyServicesEmail,
  extractAddress,
  extractDateTime,
  classifyAppointmentType,
} from "../src/lib/emailInsight.js";

const SAMPLE_BODY = `Energy Services has scheduled a Con Edison inspection appointment
for 503 Schenectady Avenue on July 15, 2026 at 2:00 PM.
Please ensure access to the meter room.`;

describe("emailInsight", () => {
  it("detects Energy Services senders", () => {
    expect(isEnergyServicesEmail("noreply@energy-services.com", "Appointment", "")).toBe(true);
    expect(isEnergyServicesEmail("alerts@coned.com", "Inspection", "")).toBe(true);
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
    expect(raw.dateTime).toMatch(/2026-07-15T14:00/);
  });

  it("extractDateTime handles slash dates", () => {
    expect(extractDateTime("Appointment 7/20/2026")).toBe("2026-07-20T09:00");
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
  });

  it("buildProposedActions includes reminders for inspections", () => {
    const insight = { appointmentType: "inspection", dateTime: "2026-07-15T14:00", address: "503 Schenectady Ave" };
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
});