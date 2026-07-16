import { describe, expect, it } from "vitest";
import {
  EMAIL_MOODS,
  classifyAppointment,
  contextualReminderActions,
  followUpActions,
  followUpCopy,
  generateFollowUpEmail,
  reminderQuickActions,
} from "../src/lib/appointmentActions.js";

describe("appointmentActions", () => {
  it("classifies appointment job states", () => {
    expect(classifyAppointment(null)).toBe("no_job");
    expect(classifyAppointment({ id: "J1" })).toBe("job_no_docs");
    expect(classifyAppointment({ id: "J1", estimateNo: "E-1" })).toBe("job_estimate_pending");
    expect(classifyAppointment({ id: "J1", estimateNo: "E-1", invoiceNo: "I-1" })).toBe(
      "job_estimate_and_invoice"
    );
    expect(classifyAppointment({ id: "J1", invoiceNo: "I-1" })).toBe("job_invoice_only");
  });

  it("followUpActions vary by scenario", () => {
    expect(followUpActions("no_job").map((a) => a.key)).toEqual(["create_job"]);
    expect(followUpActions("job_no_docs").map((a) => a.key)).toContain("create_estimate");
    expect(followUpActions("job_estimate_pending").map((a) => a.key)).toContain("email_followup");
    expect(followUpActions("job_estimate_and_invoice").map((a) => a.key)).toContain("email_invoice");
  });

  it("has five email moods", () => {
    expect(EMAIL_MOODS).toHaveLength(5);
  });

  it("generateFollowUpEmail produces distinct moods", () => {
    const job = { customer: "Jane Doe", title: "Panel upgrade", estimateNo: "251900" };
    const pro = generateFollowUpEmail(job, "estimate", "professional");
    const funny = generateFollowUpEmail(job, "estimate", "casual");
    expect(pro).toContain("Jane");
    expect(pro).toContain("251900");
    expect(funny).not.toBe(pro);
    expect(funny.length).toBeGreaterThan(20);
  });

  it("followUpCopy returns titles for each scenario", () => {
    expect(followUpCopy("no_job").title).toMatch(/job/i);
    expect(followUpCopy("job_estimate_pending").title).toMatch(/estimate/i);
  });

  it("reminderQuickActions always offers job, estimate, and invoice", () => {
    expect(reminderQuickActions().map((a) => a.key)).toEqual([
      "create_job",
      "create_estimate",
      "create_invoice",
    ]);
  });

  it("contextualReminderActions never offers create when docs already exist", () => {
    const keys = contextualReminderActions({ id: "J1", invoiceNo: "I-1" }).map((a) => a.key);
    expect(keys).not.toContain("create_job");
    expect(keys).not.toContain("create_invoice");
  });
});