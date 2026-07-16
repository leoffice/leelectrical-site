/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  UNSENT_DISMISS_KEY,
  assessJobFollowUp,
  dismissUnsentDoc,
  docNeverSent,
  hasDoc,
  specificFollowUpNudge,
  unsentDocCandidates,
  withinSentCooldown,
} from "../src/lib/followUpStatus.js";
import { contextualReminderActions as ctxFromAppt } from "../src/lib/appointmentActions.js";
import { serviceCallCandidates, buildPromptQueue } from "../src/lib/followUpReminders.js";
import { STATE_KEY } from "../src/lib/followUpReminders.js";

beforeEach(() => {
  localStorage.removeItem(UNSENT_DISMISS_KEY);
  localStorage.removeItem(STATE_KEY);
});

describe("followUpStatus", () => {
  it("detects generated docs and unsent state", () => {
    const job = { id: "J-1", invoiceNo: "251900", invoiceHistory: [] };
    expect(hasDoc(job, "invoice")).toBe(true);
    expect(docNeverSent(job, "invoice", [])).toBe(true);
  });

  it("suppresses service-call popup when invoice exists but was never sent", () => {
    const job = { id: "J-1", customer: "Michelle", invoiceNo: "251900", invoiceHistory: [] };
    const assessment = assessJobFollowUp(job, "2026-07-15", []);
    expect(assessment.suppressServiceCall).toBe(true);
    expect(assessment.reason).toBe("invoice_unsent");
  });

  it("suppresses and auto-postpones when invoice was sent within a week", () => {
    const job = {
      id: "J-1",
      customer: "Michelle",
      invoiceNo: "251900",
      invoiceHistory: [{ date: "2026-07-14", kind: "Invoice #251900 emailed", to: "a@x.com" }],
    };
    const assessment = assessJobFollowUp(job, "2026-07-15", []);
    expect(assessment.suppressServiceCall).toBe(true);
    expect(assessment.autoRemindAt).toBe("2026-07-21T10:00");
    expect(withinSentCooldown(job, "invoice", "2026-07-15")).toBe(true);
  });

  it("shows email follow-up nudge after send cooldown passes", () => {
    const job = {
      id: "J-1",
      customer: "Michelle",
      invoiceNo: "251900",
      invoiceHistory: [{ date: "2026-07-01", kind: "Invoice #251900 emailed", to: "a@x.com" }],
    };
    const assessment = assessJobFollowUp(job, "2026-07-15", []);
    expect(assessment.suppressServiceCall).toBe(false);
    const nudge = specificFollowUpNudge(job, "2026-07-15", []);
    expect(nudge).toMatch(/payment follow-up|emailed/i);
  });

  it("scans for unsent docs across active jobs", () => {
    const jobs = [
      { id: "J-1", invoiceNo: "100", invoiceHistory: [] },
      { id: "J-2", estimateNo: "55", invoiceHistory: [] },
      { id: "J-3", paid: true, invoiceNo: "9", invoiceHistory: [] },
    ];
    const hits = unsentDocCandidates(jobs, []);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.job.id).sort()).toEqual(["J-1", "J-2"]);
  });

  it("respects unsent dismissals", () => {
    dismissUnsentDoc("J-1", "invoice");
    const jobs = [{ id: "J-1", invoiceNo: "100", invoiceHistory: [] }];
    expect(unsentDocCandidates(jobs, [])).toHaveLength(0);
  });

  it("does not flag unsent when a send command succeeded", () => {
    const job = { id: "J-1", invoiceNo: "100", invoiceHistory: [] };
    const cmds = [{ type: "send_invoice", jobId: "J-1", status: "done", payload: { invoiceNo: "100" } }];
    expect(docNeverSent(job, "invoice", cmds)).toBe(false);
    expect(unsentDocCandidates([job], cmds)).toHaveLength(0);
  });

  it("serviceCallCandidates skips appointments with recent invoice work", () => {
    const jobs = [
      {
        id: "J-1",
        customer: "Montgomery",
        calEventId: "ev-m",
        invoiceNo: "251900",
        invoiceHistory: [{ date: "2026-07-14", kind: "Invoice #251900 emailed", to: "a@x.com" }],
      },
    ];
    const events = [{ id: "ev-m", summary: "Montgomery St — service", start: "2026-07-10T10:00" }];
    expect(serviceCallCandidates(events, jobs, "2026-07-15", new Date("2026-07-15T12:00:00"), [])).toHaveLength(0);
    const raw = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(raw["ev-m"].remindAt).toBe("2026-07-21T10:00");
  });

  it("buildPromptQueue surfaces unsent doc before service calls", () => {
    const jobs = [{ id: "J-9", customer: "Bob", invoiceNo: "88", invoiceHistory: [] }];
    const q = buildPromptQueue([], jobs, "2026-07-15");
    expect(q.some((x) => x.kind === "unsent_doc" && x.job.id === "J-9")).toBe(true);
  });
});

describe("contextualReminderActions", () => {
  it("hides create-invoice when invoice already exists", () => {
    const job = { id: "J-1", invoiceNo: "100", estimateNo: "50" };
    const keys = ctxFromAppt(job).map((a) => a.key);
    expect(keys).not.toContain("create_invoice");
    expect(keys).not.toContain("create_estimate");
    expect(keys).toContain("email_invoice");
  });
});