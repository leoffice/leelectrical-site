import { describe, expect, it } from "vitest";
import {
  intentOpensDocBuilder,
  parseReminderNote,
  reminderIntentJobPath,
} from "../src/lib/reminderNoteIntent.js";

describe("reminderNoteIntent", () => {
  const job = { id: "J-1", customer: "Michelle Lee", estimateNo: "251900" };
  const jobWithInv = { id: "J-2", customer: "Bob", invoiceNo: "251900" };

  it("detects create invoice from natural language", () => {
    const intent = parseReminderNote("please create an invoice with the information", job);
    expect(intent?.action).toBe("create_invoice");
    expect(intentOpensDocBuilder(intent)).toBe(true);
    expect(reminderIntentJobPath(intent, job.id)).toContain("doc=invoice");
  });

  it("detects create estimate", () => {
    const bare = { id: "J-3", customer: "Sam" };
    expect(parseReminderNote("need to create estimate for panel work", bare)?.action).toBe(
      "create_estimate"
    );
  });

  it("does not treat 'make sure updated invoice' as create invoice", () => {
    const intent = parseReminderNote("Make sure they have updated invoice", jobWithInv);
    expect(intent?.action).not.toBe("create_invoice");
    expect(intent?.action).toBe("email_invoice");
  });

  it("does not offer create invoice when invoice already exists", () => {
    const intent = parseReminderNote("create an invoice please", jobWithInv);
    expect(intent?.action).toBe("email_invoice");
    expect(intentOpensDocBuilder(intent)).toBe(false);
  });

  it("detects estimate follow-up when estimate exists", () => {
    expect(parseReminderNote("check on approval", job)?.action).toBe("email_followup");
  });

  it("returns null for empty note", () => {
    expect(parseReminderNote("", job)).toBeNull();
  });
});