import { describe, it, expect } from "vitest";
import {
  jobDefaultSummary,
  jobDefaultNotes,
  defaultReminders,
  defaultNotifyCustomer,
} from "../src/lib/appointmentDefaults.js";

describe("appointmentDefaults (create-appointment skill)", () => {
  const lipsker = {
    customer: "Dovber Lipsker",
    personName: "Dovber Lipsker",
    email: "Lipskier@gmail.com",
    phone: "",
    title:
      "Site visit — 4-meter service upgrade (3-family). Currently 3 meters / 2 wires. Wants 4 meters…",
    description: "Lead from WhatsApp (Dovber Lipsker). Reference job: 2421 Dean St.",
    notes: "Price match $7,500 / $9,500. Buying for himself.",
    followUp: { type: "site_visit" },
    status: { "Site Visit": { s: "done", d: "2026-07-22" } },
  };

  it("site visit title is short — name only, no slash address", () => {
    expect(jobDefaultSummary(lipsker)).toBe("Site visit — Dovber Lipsker");
    expect(jobDefaultSummary(lipsker)).not.toMatch(/53rd|\//);
  });

  it("service call and follow-up titles", () => {
    expect(jobDefaultSummary({ customer: "A", title: "Service call wiring" })).toBe(
      "Service call — A"
    );
    expect(jobDefaultSummary({ customer: "B", title: "Follow-up after estimate" })).toBe(
      "Follow-up — B"
    );
  });

  it("keeps short job titles with customer", () => {
    expect(jobDefaultSummary({ customer: "Peretz Chein", title: "Panel upgrade" })).toBe(
      "Panel upgrade — Peretz Chein"
    );
  });

  it("notes are structured and strip price / QBO / LE Pro job prose", () => {
    const n = jobDefaultNotes(lipsker);
    expect(n).toContain("Customer: Dovber Lipsker");
    expect(n).toContain("Email: Lipskier@gmail.com");
    expect(n).toMatch(/WhatsApp|2421 Dean/);
    expect(n).not.toMatch(/\$7,500/);
    expect(n).not.toMatch(/QBO #/);
    expect(n).not.toMatch(/LE Pro job:/);
  });

  it("reminders: site visit 1h; inspection 1h+1d", () => {
    expect(defaultReminders()).toEqual({ h1: true, d1: false });
    expect(defaultReminders({ inspection: true })).toEqual({ h1: true, d1: true });
  });

  it("guest notify off for regular jobs, on for inspection with email", () => {
    expect(defaultNotifyCustomer(lipsker)).toBe(false);
    expect(defaultNotifyCustomer(lipsker, { inspection: true })).toBe(true);
    expect(defaultNotifyCustomer({}, { inspection: true })).toBe(false);
  });
});
