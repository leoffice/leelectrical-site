/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  UNSENT_DISMISS_KEY,
  UNSENT_SNOOZE_KEY,
  assessJobFollowUp,
  dismissUnsentDoc,
  docNeverSent,
  hasDoc,
  isUnsentSnoozed,
  snoozeUnsentDoc,
  specificFollowUpNudge,
  unsentDocCandidates,
  unsentDocCardFields,
  withinSentCooldown,
} from "../src/lib/followUpStatus.js";
import { contextualReminderActions as ctxFromAppt } from "../src/lib/appointmentActions.js";
import {
  serviceCallCandidates,
  buildPromptQueue,
  cancelStaleUnsentReminders,
  allocateReminderTime,
  STATE_KEY,
} from "../src/lib/followUpReminders.js";

beforeEach(() => {
  localStorage.removeItem(UNSENT_DISMISS_KEY);
  localStorage.removeItem(UNSENT_SNOOZE_KEY);
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

  it("hides unsent docs until remind-later time passes", () => {
    const jobs = [{ id: "J-1", invoiceNo: "100", invoiceHistory: [] }];
    snoozeUnsentDoc("J-1", "invoice", "2026-07-20T10:00");
    expect(isUnsentSnoozed("J-1", "invoice", new Date("2026-07-16T12:00:00"))).toBe(true);
    expect(
      unsentDocCandidates(jobs, [], { now: new Date("2026-07-16T12:00:00") })
    ).toHaveLength(0);
    expect(
      unsentDocCandidates(jobs, [], { now: new Date("2026-07-20T11:00:00") })
    ).toHaveLength(1);
  });

  it("does not flag unsent when a send command succeeded", () => {
    const job = { id: "J-1", invoiceNo: "100", invoiceHistory: [] };
    const cmds = [{ type: "send_invoice", jobId: "J-1", status: "done", payload: { invoiceNo: "100" } }];
    expect(docNeverSent(job, "invoice", cmds)).toBe(false);
    expect(unsentDocCandidates([job], cmds)).toHaveLength(0);
  });

  it("does not flag unsent when QuickBooks EmailStatus is EmailSent", () => {
    const job = {
      id: "qbo-251849",
      customer: "Avi Loschak",
      invoiceNo: "251849",
      invoiceHistory: [],
      invoiceEmailStatus: "EmailSent",
      invoiceEmailedAt: "2026-07-15",
      email: "AviLoschak@gmail.com",
    };
    expect(docNeverSent(job, "invoice", [])).toBe(false);
    expect(unsentDocCandidates([job], [])).toHaveLength(0);
    const assessment = assessJobFollowUp(job, "2026-07-16", []);
    expect(assessment.reason).not.toBe("invoice_unsent");
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

  it("unsentDocCardFields lists invoice number, date, address, amount, and due when different", () => {
    const job = {
      id: "J-1",
      customer: "Bob",
      invoiceNo: "251900",
      invoiceDate: "2026-07-10",
      serviceAddress: "100 Main St Brooklyn",
      amount: "$1,500",
      openBalance: "$500",
      invoiceHistory: [],
    };
    const card = unsentDocCardFields(job, "invoice");
    expect(card.docNo).toBe("251900");
    expect(card.date).toMatch(/07\/10\/2026|7\/10\/2026/);
    expect(card.address).toMatch(/100 Main/);
    expect(card.amountInvoiced).toMatch(/1,500|1500/);
    expect(card.dueDiffers).toBe(true);
    expect(card.amountDue).toMatch(/500/);
    expect(card.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(["Invoice #", "Invoice date", "Service address", "Amount invoiced", "Amount due"])
    );
  });

  it("cancels stale unsent reminders once QuickBooks shows the invoice was emailed", () => {
    allocateReminderTime("ev-stale", "2026-07-10T10:00", {
      note: "Invoice was created but never emailed — open and send",
      priority: "high",
    });
    const jobs = [
      {
        id: "J-1",
        calEventId: "ev-stale",
        invoiceNo: "251839",
        invoiceEmailStatus: "EmailSent",
        invoiceEmailedAt: "2026-07-15",
        invoiceHistory: [{ date: "2026-07-15", kind: "Invoice #251839 emailed", source: "qbo" }],
      },
    ];
    const events = [{ id: "ev-stale", summary: "Chani — service", start: "2026-07-10T10:00" }];
    expect(cancelStaleUnsentReminders(events, jobs, [])).toBe(1);
    const q = buildPromptQueue(events, jobs, "2026-07-16", new Date("2026-07-16T12:00:00"), []);
    expect(q.some((x) => x.kind === "unsent_doc" && x.job?.invoiceNo === "251839")).toBe(false);
    expect(q.some((x) => x.event?.id === "ev-stale")).toBe(false);
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