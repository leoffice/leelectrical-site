import { describe, expect, it } from "vitest";
import {
  EMAIL_MOODS,
  defaultComposeDraft,
  defaultEmailSubject,
  emailToSms,
  generateCustomerMessage,
} from "../src/lib/customerCompose.js";

const job = {
  customer: "Jane Doe",
  title: "Panel upgrade",
  invoiceNo: "251900",
  phone: "718-555-1111",
  email: "jane@x.com",
};

describe("customerCompose", () => {
  it("has five polish moods", () => {
    expect(EMAIL_MOODS).toHaveLength(5);
  });

  it("defaultEmailSubject varies by context", () => {
    expect(defaultEmailSubject(job, "payment")).toContain("251900");
    expect(defaultEmailSubject(job, "general")).toContain("Panel");
  });

  it("generateCustomerMessage produces distinct moods", () => {
    const pro = generateCustomerMessage(job, { channel: "email", mood: "professional" });
    const funny = generateCustomerMessage(job, { channel: "email", mood: "casual" });
    expect(pro).toContain("Jane");
    expect(funny).not.toBe(pro);
  });

  it("payment context includes link in draft", () => {
    const sms = generateCustomerMessage(job, {
      channel: "sms",
      context: "payment",
      mood: "friendly",
      url: "https://pay.example/x",
    });
    expect(sms).toContain("https://pay.example/x");
    expect(sms.length).toBeLessThanOrEqual(320);
  });

  it("emailToSms shortens long bodies", () => {
    const long = "Line one\nLine two\nLine three\nLine four\nLine five\nThanks";
    const out = emailToSms(long, "https://x");
    expect(out).toContain("https://x");
    expect(out.length).toBeLessThanOrEqual(320);
  });

  it("defaultComposeDraft works for sms and email", () => {
    expect(defaultComposeDraft(job, { channel: "sms" })).toContain("Jane");
    expect(defaultComposeDraft(job, { channel: "email" })).toContain("Jane");
  });
});