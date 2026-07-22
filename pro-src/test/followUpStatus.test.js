/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  UNSENT_DISMISS_KEY,
  UNSENT_SNOOZE_KEY,
  UNSENT_ESTIMATE_MAX_AGE_DAYS,
  UNSENT_INVOICE_MAX_AGE_DAYS,
  assessJobFollowUp,
  dismissUnsentDoc,
  docNeverSent,
  estimateDateYmd,
  hasDoc,
  isUnsentSnoozed,
  lastUndatedEstimateSuppressCount,
  snoozeUnsentDoc,
  specificFollowUpNudge,
  unsentDocCandidates,
  unsentDocCardFields,
  withinSentCooldown,
} from "../src/lib/followUpStatus.js";
import { daysBetween, localYmd } from "../src/lib/dateUtils.js";
import { contextualReminderActions as ctxFromAppt } from "../src/lib/appointmentActions.js";
import {
  serviceCallCandidates,
  buildPromptQueue,
  buildReminderList,
  cancelStaleUnsentReminders,
  allocateReminderTime,
  STATE_KEY,
} from "../src/lib/followUpReminders.js";

/** Local YYYY-MM-DD offset from a fixed anchor date string. */
function ymdOffset(anchorYmd, days) {
  const d = new Date(anchorYmd + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

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
    // Estimates need a recent document date (30-day window); undated estimates are suppressed.
    const jobs = [
      { id: "J-1", invoiceNo: "100", invoiceHistory: [], invoiceDate: "2026-06-01" },
      { id: "J-2", estimateNo: "55", estimateDate: "2026-07-10", invoiceHistory: [] },
      { id: "J-3", paid: true, invoiceNo: "9", invoiceHistory: [] },
    ];
    const hits = unsentDocCandidates(jobs, [], { now: new Date("2026-07-16T12:00:00") });
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.job.id).sort()).toEqual(["J-1", "J-2"]);
  });

  it("skips unsent invoices older than one year", () => {
    const jobs = [
      { id: "J-old", invoiceNo: "100", invoiceHistory: [], invoiceDate: "2024-01-15" },
      { id: "J-new", invoiceNo: "200", invoiceHistory: [], invoiceDate: "2026-06-01" },
      { id: "J-nodate", invoiceNo: "300", invoiceHistory: [] }, // no date → still eligible
    ];
    const hits = unsentDocCandidates(jobs, [], { now: new Date("2026-07-16T12:00:00") });
    expect(hits.map((h) => h.job.id).sort()).toEqual(["J-new", "J-nodate"]);
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

describe("estimateDateYmd", () => {
  it("prefers estimateDate over invoiceDate", () => {
    expect(
      estimateDateYmd({
        estimateDate: "2026-07-01",
        invoiceDate: "2026-06-01",
        status: { Estimate: { d: "2026-05-01" }, Invoiced: { d: "2026-04-01" } },
      })
    ).toBe("2026-07-01");
  });

  it("falls back estimate status → invoiceDate → invoiced status", () => {
    expect(estimateDateYmd({ status: { Estimate: { d: "2026-03-15" } } })).toBe("2026-03-15");
    expect(estimateDateYmd({ invoiceDate: "2026-04-20" })).toBe("2026-04-20");
    expect(estimateDateYmd({ status: { Invoiced: { d: "2026-05-05" } } })).toBe("2026-05-05");
    expect(estimateDateYmd({ estimateNo: "1001" })).toBe("");
  });
});

describe("unsent estimate 30-day + invoice 1-year windows", () => {
  // Inclusive boundary: daysBetween(estYmd, todayYmd) <= 30 keeps the estimate.
  const NOW = new Date(2026, 6, 20, 12, 0, 0); // 2026-07-20 local noon
  const TODAY = "2026-07-20";
  const opts = { now: NOW };

  function estJob(id, estimateDate, extra = {}) {
    return {
      id,
      estimateNo: String(id).replace(/\D/g, "") || "1",
      estimateDate,
      invoiceHistory: [],
      ...extra,
    };
  }

  it("estimate dated 2016 is NOT a candidate", () => {
    expect(unsentDocCandidates([estJob("E-2016", "2016-03-15")], [], opts)).toHaveLength(0);
  });

  it("estimate dated today IS a candidate", () => {
    const hits = unsentDocCandidates([estJob("E-today", TODAY)], [], opts);
    expect(hits).toHaveLength(1);
    expect(hits[0].docKind).toBe("estimate");
  });

  it("estimate dated exactly 29 days ago IS a candidate", () => {
    const ymd = ymdOffset(TODAY, -29);
    expect(daysBetween(ymd, TODAY)).toBe(29);
    expect(unsentDocCandidates([estJob("E-29", ymd)], [], opts)).toHaveLength(1);
  });

  it("estimate dated exactly 31 days ago is NOT a candidate", () => {
    const ymd = ymdOffset(TODAY, -31);
    expect(daysBetween(ymd, TODAY)).toBe(31);
    expect(unsentDocCandidates([estJob("E-31", ymd)], [], opts)).toHaveLength(0);
  });

  it("30-day boundary is inclusive — exactly 30 days ago IS a candidate", () => {
    expect(UNSENT_ESTIMATE_MAX_AGE_DAYS).toBe(30);
    const ymd = ymdOffset(TODAY, -30);
    expect(daysBetween(ymd, TODAY)).toBe(30);
    expect(unsentDocCandidates([estJob("E-30", ymd)], [], opts)).toHaveLength(1);
  });

  it("invoice older than one year is NOT a candidate", () => {
    expect(UNSENT_INVOICE_MAX_AGE_DAYS).toBe(365);
    const job = {
      id: "INV-2016",
      invoiceNo: "2016-1",
      invoiceDate: "2016-01-05",
      invoiceHistory: [],
    };
    expect(unsentDocCandidates([job], [], opts)).toHaveLength(0);
  });

  it("invoice within one year IS a candidate", () => {
    const job = {
      id: "INV-new",
      invoiceNo: "251900",
      invoiceDate: "2026-01-15",
      invoiceHistory: [],
    };
    const hits = unsentDocCandidates([job], [], opts);
    expect(hits).toHaveLength(1);
    expect(hits[0].docKind).toBe("invoice");
  });

  it("undated estimate is NOT a candidate and is counted", () => {
    const job = { id: "E-undated", estimateNo: "999", invoiceHistory: [] };
    expect(unsentDocCandidates([job], [], opts)).toHaveLength(0);
    expect(lastUndatedEstimateSuppressCount).toBe(1);
  });

  it("buildPromptQueue and buildReminderList both honor estimate + invoice windows", () => {
    const jobs = [
      estJob("E-2016", "2016-06-01"),
      estJob("E-fresh", TODAY),
      { id: "INV-old", invoiceNo: "1", invoiceDate: "2016-01-01", invoiceHistory: [] },
      { id: "INV-new", invoiceNo: "2", invoiceDate: "2026-06-01", invoiceHistory: [] },
    ];
    const q = buildPromptQueue([], jobs, TODAY, NOW, []);
    const list = buildReminderList([], jobs, TODAY, NOW, []);
    const unsentQ = q.filter((x) => x.kind === "unsent_doc");
    const unsentL = list.filter((x) => x.kind === "unsent_doc");
    expect(unsentQ.map((x) => x.job.id).sort()).toEqual(["E-fresh", "INV-new"]);
    expect(unsentL.map((x) => x.job.id).sort()).toEqual(["E-fresh", "INV-new"]);
  });

  it("other reminder types untouched — service/inspection/must/scheduled still surface", () => {
    const now = new Date("2026-07-15T12:00:00");
    const today = "2026-07-15";
    const jobs = [
      { id: "J-svc", customer: "Sam", calEventId: "ev-svc" },
      estJob("E-old", "2016-01-01"),
    ];
    const events = [
      { id: "ev-svc", summary: "Sam — service call", start: "2026-07-10T10:00" },
      { id: "ev-insp", summary: "Inspection 123 Main", start: "2026-07-15T09:00" },
    ];
    allocateReminderTime("ev-must", "2026-07-15T09:00", {
      priority: "must_today",
      note: "Must do today",
    });
    allocateReminderTime("ev-sched", "2026-07-15T08:00", {
      priority: "medium",
      note: "Scheduled ping",
    });
    events.push(
      { id: "ev-must", summary: "Must event", start: "2026-07-14T10:00" },
      { id: "ev-sched", summary: "Sched event", start: "2026-07-14T10:00" }
    );

    const list = buildReminderList(events, jobs, today, now, []);
    const byKind = (k) => list.filter((x) => x.kind === k).length;
    expect(byKind("service_call")).toBeGreaterThanOrEqual(1);
    expect(byKind("inspection")).toBe(1);
    expect(byKind("must_today_nudge")).toBe(1);
    expect(byKind("scheduled_reminder")).toBe(1);
    expect(list.some((x) => x.kind === "unsent_doc" && x.job?.id === "E-old")).toBe(false);
  });
});

describe("contextualReminderActions", () => {
  it("hides create-invoice when invoice already exists", () => {
    const job = { id: "J-1", invoiceNo: "100", estimateNo: "50" };
    const keys = ctxFromAppt(job).map((a) => a.key);
    expect(keys).not.toContain("create_invoice");
    expect(keys).not.toContain("create_estimate");
    expect(keys).not.toContain("create_job");
    expect(keys).toContain("email_invoice");
  });

  it("hides create-job when a soft-matched candidate job exists", () => {
    const keys = ctxFromAppt(null, {
      candidates: [{ id: "J-9", customer: "Bob", invoiceNo: "88" }],
    }).map((a) => a.key);
    expect(keys).not.toContain("create_job");
    expect(keys).not.toContain("create_invoice");
    expect(keys).toContain("email_invoice");
  });

  it("hides create-job and create-invoice when note says updated invoice", () => {
    const keys = ctxFromAppt(null, {
      note: "Make sure they have updated invoice",
    }).map((a) => a.key);
    expect(keys).not.toContain("create_job");
    expect(keys).not.toContain("create_invoice");
  });
});