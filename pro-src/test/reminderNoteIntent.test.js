import { describe, expect, it } from "vitest";
import {
  intentOpensDocBuilder,
  parseReminderNote,
  reminderIntentJobPath,
} from "../src/lib/reminderNoteIntent.js";

describe("reminderNoteIntent", () => {
  const job = { id: "J-1", customer: "Michelle Lee", estimateNo: "251900" };

  it("detects create invoice from natural language", () => {
    const intent = parseReminderNote("please create an invoice with the information", job);
    expect(intent?.action).toBe("create_invoice");
    expect(intentOpensDocBuilder(intent)).toBe(true);
    expect(reminderIntentJobPath(intent, job.id)).toContain("doc=invoice");
  });

  it("detects create estimate", () => {
    expect(parseReminderNote("need to create estimate for panel work", job)?.action).toBe(
      "create_estimate"
    );
  });

  it("detects estimate follow-up when estimate exists", () => {
    expect(parseReminderNote("check on approval", job)?.action).toBe("email_followup");
  });

  it("returns null for empty note", () => {
    expect(parseReminderNote("", job)).toBeNull();
  });
});