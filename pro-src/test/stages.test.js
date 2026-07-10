// Stage/phase logic + filter chips + grouping — matched against sleek.html.
import { describe, expect, it } from "vitest";
import {
  FILTER_NAMES,
  PHASES,
  STAGES,
  clientKey,
  matchesFilter,
  matchesQuery,
  nextAction,
  phaseOfStage,
  progressPct,
  sortJobs,
  stageOf,
} from "../src/lib/stages.js";
import { DATE_STEPS, PAPER, isDatedStep } from "../src/lib/paperwork.js";
import { ago } from "../src/lib/format.js";
import { countLeaves } from "../src/state/store.jsx";

const done = (d) => ({ s: "done", d });

describe("stage model", () => {
  it("has the exact 11 stages and 5 phases from the dashboard", () => {
    expect(STAGES).toEqual([
      "Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt",
      "Paperwork", "Scheduled", "Done", "Follow-up", "Paid",
    ]);
    expect(PHASES.map((p) => p.nm)).toEqual(["Sales", "Billing", "Paperwork", "Job", "Final payment"]);
    expect(PHASES.flatMap((p) => p.steps)).toEqual(STAGES);
  });

  it("stageOf = first stage not done/skipped; Paid when all cleared", () => {
    expect(stageOf({ status: {} })).toBe("Lead");
    expect(stageOf({ status: { Lead: done(), "Site Visit": { s: "skipped" } } })).toBe("Estimate");
    const all = {};
    STAGES.forEach((s) => (all[s] = done()));
    expect(stageOf({ status: all })).toBe("Paid");
  });

  it("progressPct counts done+skipped", () => {
    expect(progressPct({ status: {} })).toBe(0);
    expect(progressPct({ status: { Lead: done(), "Site Visit": { s: "skipped" } } })).toBe(Math.round((2 / 11) * 100));
  });

  it("phaseOfStage maps Scheduled -> Job phase", () => {
    expect(phaseOfStage("Scheduled").nm).toBe("Job");
  });

  it("nextAction flags overdue follow-ups and uncollected payments", () => {
    const cleared = {};
    STAGES.forEach((s) => (cleared[s] = done()));
    expect(nextAction({ status: cleared, paid: false })).toBe("Collect payment");
    const fuJob = { status: {}, followUp: { date: "2000-01-01" } };
    // stage Lead, so plain next
    expect(nextAction(fuJob)).toBe("Next: Lead");
    const st = {};
    ["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt", "Paperwork", "Scheduled", "Done"].forEach(
      (s) => (st[s] = done())
    );
    expect(nextAction({ status: st, followUp: { date: "2000-01-01" } })).toBe("Follow-up due (overdue)");
  });
});

describe("filter chips (sleek chipTest)", () => {
  const inv = { status: {}, paid: false, invoiceNo: "1" };
  it("has the exact chip set", () => {
    expect(FILTER_NAMES).toEqual([
      "Active", "Needs attention", "To Do", "Upcoming", "Leads", "Estimates", "Scheduled", "Unpaid", "Paid", "All",
    ]);
  });
  it("Active = all jobs (recent sort in Jobs view), Paid = paid, Unpaid needs an invoice", () => {
    expect(matchesFilter({ paid: false, status: {} }, "Active")).toBe(true);
    expect(matchesFilter({ paid: true, status: {} }, "Active")).toBe(true);
    expect(matchesFilter(inv, "Unpaid")).toBe(true);
    expect(matchesFilter({ paid: false, status: {} }, "Unpaid")).toBe(false);
    expect(matchesFilter({ paid: true, status: {} }, "Paid")).toBe(true);
  });
  it("Scheduled matches current stage OR a done Scheduled step on an open job", () => {
    const st = {};
    ["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt", "Paperwork"].forEach((s) => (st[s] = done()));
    expect(matchesFilter({ status: st, paid: false }, "Scheduled")).toBe(true); // at Scheduled
    expect(
      matchesFilter({ status: { Scheduled: done("2026-07-10") }, paid: false }, "Scheduled")
    ).toBe(true); // done Scheduled, job still open
  });
});

describe("grouping + sorting", () => {
  it("clientGroup groups; otherwise solo", () => {
    expect(clientKey({ id: "a", clientGroup: "grp1" })).toBe("g:grp1");
    expect(clientKey({ id: "a" })).toBe("j:a");
  });
  it("sorts by amount desc like sleek", () => {
    const out = sortJobs([{ amount: "$100" }, { amount: "$2,300" }, { amount: 500 }]);
    expect(out.map((j) => j.amount)).toEqual(["$2,300", 500, "$100"]);
  });
  it("query matches customer/title/address/invoice", () => {
    const j = { customer: "Peretz", title: "Panel", address: "123 Main", invoiceNo: "251841" };
    expect(matchesQuery(j, "peretz panel")).toBe(true);
    expect(matchesQuery(j, "251841")).toBe(true);
    expect(matchesQuery(j, "nope")).toBe(false);
  });
});

describe("paperwork branch definitions (exact app/jobs.html lists — the authoritative old dashboard)", () => {
  it("has exactly the two saved-data branch keys coned + dob", () => {
    expect(Object.keys(PAPER)).toEqual(["coned", "dob"]);
  });
  it("Con Ed includes Inspection appointment after Final checklist", () => {
    expect(PAPER.coned.steps).toEqual([
      "Application submitted", "POE scheduled", "Uploaded paperwork complete",
      "New accounts activated", "Interim checklist", "Final checklist",
      "Inspection appointment", "Meter installation date",
    ]);
  });
  it("DOB / City permit matches jobs.html DOB_STEPS (5 sub-steps — no 'Application submitted')", () => {
    expect(PAPER.dob.steps).toEqual([
      "Permit issued", "Inspection requested",
      "Inspection scheduled", "Self certification", "PAA complete",
    ]);
  });
  it("date fields match jobs.html DATE_STEPS exactly (nothing else is dated)", () => {
    expect(DATE_STEPS).toEqual({
      "Inspection scheduled": "datetime",
      "Inspection appointment": "datetime",
      "Meter installation date": "date",
    });
    expect(isDatedStep("Inspection scheduled")).toBe(true);
    expect(isDatedStep("Meter installation date")).toBe(true);
    expect(isDatedStep("POE scheduled")).toBe(false); // sleek's regex wrongly dated this
    expect(isDatedStep("Application submitted")).toBe(false);
  });
});

describe("ago() — sync chip rounding (floor, never an early '1d ago')", () => {
  const at = (msAgo) => ago(Date.now() - msAgo);
  it("minutes / hours / days floor correctly", () => {
    expect(at(30 * 1000)).toBe("just now");
    expect(at(5 * 60000)).toBe("5m ago");
    expect(at(59 * 60000)).toBe("59m ago");
    expect(at(90 * 60000)).toBe("1h ago"); // was "2h ago" with Math.round
    expect(at(23.6 * 3600000)).toBe("23h ago"); // was "1d ago" with Math.round
    expect(at(25 * 3600000)).toBe("1d ago");
    expect(at(47 * 3600000)).toBe("1d ago");
    expect(ago(0)).toBe("never");
  });
});

describe("pending-count (savebar number, sleek pendCount)", () => {
  it("counts leaf edits across jobs", () => {
    expect(countLeaves({})).toBe(0);
    expect(countLeaves({ a: { paid: true, payment: { amount: "1", method: "Cash" } } })).toBe(3);
    expect(countLeaves({ a: { notes: "x" }, b: { status: { Paid: { s: "done", d: "2026-07-05" } } } })).toBe(3);
  });
});
