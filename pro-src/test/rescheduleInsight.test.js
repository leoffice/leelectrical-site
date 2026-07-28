// @vitest-environment jsdom
// A reschedule email moves ONE appointment (Levi 2026-07-27). The 1127 Lincoln
// Place mail booked Friday the 7th and left tomorrow's appointment on the
// calendar, so the job showed up twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyEmailOutcome,
  buildProposedActions,
  wantsNewCalendarAppointment,
  hasRealInsightData,
  formatAppliedLead,
} from "../src/lib/emailInsight.js";
import { findPriorAppointmentsForInsight } from "../src/lib/calendarNavigate.js";
import { applyEmailInsight } from "../src/lib/applyEmailInsight.js";
import { jobPatchFromConedPermit } from "../src/lib/conedPermit.js";

const NOW = new Date("2026-08-05T09:00:00");

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

describe("reschedule detection", () => {
  it("reads a reschedule as its own outcome, not a cancel and not a plain set", () => {
    expect(
      classifyEmailOutcome(
        "Initial Inspection Appointment Rescheduled",
        "Your inspection at 1127 Lincoln Place has been rescheduled to Aug 7, 2026 at 9:30 AM."
      )
    ).toBe("rescheduled");
    // "cancelled AND rescheduled" is a move, not a cancellation.
    expect(
      classifyEmailOutcome(
        "Appointment update",
        "Your appointment was cancelled and rescheduled to Aug 7, 2026 at 9:30 AM."
      )
    ).toBe("rescheduled");
    expect(
      classifyEmailOutcome("Inspection moved", "Your inspection has been moved to Aug 7 at 9:30 AM.")
    ).toBe("rescheduled");
  });

  it("instructional 'reschedule' footers still are not reschedules", () => {
    // The Con Ed footer that already broke cancel detection once.
    expect(
      classifyEmailOutcome(
        "Initial Inspection Scheduled",
        "Your Initial Inspection is scheduled on Aug 7, 2026 at 9:30 AM. Log in to Reschedule the appointment."
      )
    ).toBe("scheduled");
    expect(
      classifyEmailOutcome(
        "Electrical Inspection Scheduled",
        "Inspection scheduled for Aug 7. To reschedule, call 311 at least 48 hours prior."
      )
    ).toBe("scheduled");
  });

  it("a reschedule still books the new time", () => {
    const insight = {
      outcome: "rescheduled",
      appointmentType: "inspection",
      agency: "coned",
      dateTime: "2026-08-07T09:30",
      address: "1127 Lincoln Place",
      source: { subject: "Initial Inspection Appointment Rescheduled" },
      emailSnippet: "Your inspection at 1127 Lincoln Place has been rescheduled to Aug 7.",
    };
    expect(wantsNewCalendarAppointment(insight, NOW)).toBe(true);
    expect(hasRealInsightData(insight)).toBe(true);
    const keys = buildProposedActions(insight, null, NOW).map((a) => a.key);
    expect(keys).toContain("calendar");
  });

  it("a reschedule with no new date is not actionable", () => {
    expect(
      hasRealInsightData({
        outcome: "rescheduled",
        appointmentType: "inspection",
        address: "1127 Lincoln Place",
        source: { subject: "Initial Inspection Appointment Rescheduled" },
        emailSnippet: "Your inspection at 1127 Lincoln Place has been rescheduled. We will call you.",
      })
    ).toBe(false);
  });
});

describe("findPriorAppointmentsForInsight", () => {
  const insight = {
    id: "ei-resched",
    outcome: "rescheduled",
    appointmentType: "inspection",
    agency: "coned",
    dateTime: "2026-08-07T09:30",
    address: "1127 Lincoln Place",
  };
  const oldEvent = {
    id: "ev-old",
    summary: "Con Edison inspection — 9:30 AM",
    start: "2026-08-06T09:30:00",
    location: "1127 Lincoln Place, Brooklyn, NY 11213",
  };

  it("finds the job's linked appointment at the old time", () => {
    const job = { id: "J-1", serviceAddress: "1127 Lincoln Place", calEventId: "ev-old" };
    const priors = findPriorAppointmentsForInsight(insight, job, [oldEvent], { now: NOW });
    expect(priors.map((e) => e.id)).toEqual(["ev-old"]);
  });

  it("finds it by address when the job was never linked", () => {
    const priors = findPriorAppointmentsForInsight(insight, null, [oldEvent], { now: NOW });
    expect(priors.map((e) => e.id)).toEqual(["ev-old"]);
  });

  it("never touches the new appointment, other jobs, or history", () => {
    const events = [
      oldEvent,
      { id: "ev-new", summary: "Con Edison inspection", start: "2026-08-07T09:30:00", location: "1127 Lincoln Place" },
      { id: "ev-other", summary: "Con Edison inspection", start: "2026-08-09T09:30:00", location: "88 Troy Ave" },
      { id: "ev-past", summary: "Con Edison inspection", start: "2026-07-30T09:30:00", location: "1127 Lincoln Place" },
      { id: "ev-personal", summary: "Lunch with Dad", start: "2026-08-06T12:00:00", location: "1127 Lincoln Place" },
    ];
    const priors = findPriorAppointmentsForInsight(insight, null, events, { now: NOW });
    expect(priors.map((e) => e.id)).toEqual(["ev-old"]);
  });
});

describe("Con Ed paperwork follows the move", () => {
  it("overwrites the inspection date instead of keeping the old one", () => {
    const permit = {
      currentStage: "no_show_reschedule",
      primaryKey: "MC-910413",
      events: [{ eventType: "coned.reschedule" }],
    };
    const patch = jobPatchFromConedPermit(permit, {
      dateTime: "2026-08-07T09:30",
      existingPaperwork: { coned: { dates: { "Inspection appointment": "2026-08-06T09:30" } } },
    });
    expect(patch.paperwork.coned.dates["Inspection appointment"]).toBe("2026-08-07T09:30");
  });
});

describe("applying a reschedule", () => {
  const insight = {
    id: "ei-resched",
    outcome: "rescheduled",
    appointmentType: "inspection",
    agency: "coned",
    dateTime: "2026-08-07T09:30",
    address: "1127 Lincoln Place",
    proposedActions: [{ key: "calendar", defaultOn: true, enabled: true }],
  };
  const job = {
    id: "J-1",
    customer: "Lincoln Owner",
    serviceAddress: "1127 Lincoln Place",
    calEventId: "ev-old",
  };
  const events = [
    {
      id: "ev-old",
      summary: "Con Edison inspection — 9:30 AM",
      start: "2026-08-06T09:30:00",
      location: "1127 Lincoln Place",
    },
  ];

  async function run(overrides = {}) {
    const enqueued = [];
    const patches = [];
    const removed = [];
    const added = [];
    const jobPatches = [];
    const result = await applyEmailInsight({
      insight,
      job,
      selectedActionKeys: ["calendar"],
      enqueue: async (type, jobId, payload, mode, key) => {
        enqueued.push({ type, jobId, payload, key });
      },
      patchAndSave: async (id, patch) => jobPatches.push({ id, patch }),
      patchEmailInsight: async (id, patch) => patches.push({ id, patch }),
      appendLocalEvent: (e) => added.push(e),
      removeLocalEvent: (id) => removed.push(id),
      pullCalendarNow: () => {},
      showToast: null,
      autoApply: true,
      events,
      ...overrides,
    });
    return { enqueued, patches, removed, added, jobPatches, result };
  }

  it("deletes the old appointment and books the new one — one appointment, not two", async () => {
    const { enqueued, removed, added } = await run();

    const deletes = enqueued.filter((e) => e.type === "calendar_delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].payload).toEqual({ calEventId: "ev-old" });
    expect(removed).toEqual(["ev-old"]);

    const creates = enqueued.filter((e) => e.type === "calendar_upsert");
    expect(creates).toHaveLength(1);
    expect(creates[0].payload.start).toBe("2026-08-07T09:30");
    expect(added).toHaveLength(1);

    // Delete is ordered before the create so the two never coexist.
    expect(enqueued.findIndex((e) => e.type === "calendar_delete")).toBeLessThan(
      enqueued.findIndex((e) => e.type === "calendar_upsert")
    );
  });

  it("does not mistake the appointment it is replacing for 'already on calendar'", async () => {
    const { patches, enqueued } = await run();
    expect(patches[0]?.patch?.skipReason).toBeUndefined();
    expect(patches[0]?.patch?.replacedEventIds).toEqual(["ev-old"]);
    expect(enqueued.some((e) => e.type === "calendar_upsert")).toBe(true);
  });

  it("relinks the job to the new event instead of the deleted one", async () => {
    const { jobPatches } = await run();
    // Old link cleared, then the new pending id written.
    expect(jobPatches.some((p) => p.patch.calEventId === "")).toBe(true);
    const last = jobPatches[jobPatches.length - 1];
    expect(String(last.patch.calEventId)).toMatch(/^pending-/);
  });

  it("says what it removed", () => {
    const lead = formatAppliedLead(
      { ...insight, replacedEventCount: 1 },
      { customer: "Lincoln Owner" }
    );
    expect(lead).toMatch(/removed the old appointment/i);
  });

  it("with nothing earlier on the calendar it just books the new time", async () => {
    const { enqueued, removed, patches } = await run({
      job: { ...job, calEventId: "" },
      events: [],
    });
    expect(enqueued.filter((e) => e.type === "calendar_delete")).toHaveLength(0);
    expect(removed).toEqual([]);
    expect(enqueued.filter((e) => e.type === "calendar_upsert")).toHaveLength(1);
    expect(patches[0]?.patch?.replacedEventIds).toBeUndefined();
  });
});
