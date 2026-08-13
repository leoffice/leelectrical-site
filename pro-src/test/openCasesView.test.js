// openCasesView — Open Cases card derivation (buckets, rails, stale, verification).
import { describe, expect, it } from "vitest";
import { buildPermitBoard } from "../src/lib/permitsBoard.js";
import {
  CONED_RAIL,
  DOB_RAIL,
  buildOpenCaseCards,
  buildRailSteps,
  filterOpenCaseCards,
  trackTone,
} from "../src/lib/openCasesView.js";

const NOW = Date.parse("2026-08-13T12:00:00Z");
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString();

function jobWithConed(id, stage, { updatedAt = iso(NOW - DAY), events, health } = {}) {
  return {
    id,
    customer: `Cust ${id}`,
    serviceAddress: `${id} Main St`,
    permits: [
      {
        id: `p-${id}`,
        agency: "coned",
        primaryKey: `MC-${id}`,
        currentStage: stage,
        updatedAt,
        ...(health ? { health } : {}),
        events:
          events ??
          [
            {
              eventType: "case_created",
              subject: `Con Edison Case Number MC-${id} - Created`,
              createdAt: updatedAt,
            },
          ],
      },
    ],
  };
}

function jobWithDob(id, stage, { updatedAt = iso(NOW - DAY) } = {}) {
  return {
    id,
    customer: `Cust ${id}`,
    serviceAddress: `${id} Court St`,
    permits: [
      {
        id: `pd-${id}`,
        agency: "city",
        primaryKey: `M00${id}`,
        currentStage: stage,
        updatedAt,
        events: [{ eventType: "filing", subject: "DOB NOW filing submitted", createdAt: updatedAt }],
      },
    ],
  };
}

function cards(jobs, caseRuns = []) {
  const board = buildPermitBoard({ jobs, insights: [], config: null });
  return buildOpenCaseCards({ board, caseRuns, now: NOW });
}

describe("buildOpenCaseCards", () => {
  it("one card per job with both rails when Con Ed + DOB exist", () => {
    const j = {
      ...jobWithConed("J1", "layout_issued"),
      permits: [
        ...jobWithConed("J1", "layout_issued").permits,
        ...jobWithDob("J1", "under_review").permits,
      ],
    };
    const { cards: out } = cards([j]);
    expect(out).toHaveLength(1);
    expect(out[0].hasConed).toBe(true);
    expect(out[0].hasDob).toBe(true);
    expect(out[0].tracks).toHaveLength(2);
    expect(out[0].bucket).toBe("progress");
  });

  it("buckets: completed when every track passed/terminal; needs on blocked health", () => {
    const done = jobWithConed("JD", "meter_turn_on");
    const blocked = jobWithConed("JB", "docs_pending");
    const { cards: out, counts } = cards([done, blocked]);
    const byId = Object.fromEntries(out.map((c) => [c.jobId, c]));
    expect(byId.JD.bucket).toBe("completed");
    expect(byId.JB.bucket).toBe("needs");
    expect(counts.completed).toBe(1);
    expect(counts.needs).toBe(1);
    // needs sorts first, completed last
    expect(out[0].jobId).toBe("JB");
    expect(out[out.length - 1].jobId).toBe("JD");
  });

  it(">7-day silence on an open track flags the card as needs-attention", () => {
    const stale = jobWithConed("JS", "survey_service_date", { updatedAt: iso(NOW - 13 * DAY) });
    const fresh = jobWithConed("JF", "survey_service_date", { updatedAt: iso(NOW - 2 * DAY) });
    const { cards: out } = cards([stale, fresh]);
    const byId = Object.fromEntries(out.map((c) => [c.jobId, c]));
    expect(byId.JS.bucket).toBe("needs");
    expect(byId.JS.stale).toBe(true);
    expect(byId.JS.tracks[0].staleDays).toBe(13);
    expect(byId.JF.bucket).toBe("progress");
    // completed tracks never go stale
    const doneOld = jobWithConed("JDone", "meter_turn_on", { updatedAt: iso(NOW - 40 * DAY) });
    const res2 = cards([doneOld]).cards[0];
    expect(res2.bucket).toBe("completed");
  });

  it("verification: email events → verified · case #; fleet submitted → awaiting email", () => {
    const verified = cards([jobWithConed("JV", "layout_issued")]).cards[0];
    expect(verified.tracks[0].verification.state).toBe("verified");
    expect(verified.tracks[0].verification.label).toContain("MC-JV");

    const noEvents = jobWithConed("JN", "application_filed", { events: [] });
    noEvents.permits[0].primaryKey = "";
    const runs = [{ id: "r1", jobId: "JN", type: "create_case", status: "submitted" }];
    const submitted = cards([noEvents], runs).cards[0];
    expect(submitted.tracks[0].verification.state).toBe("submitted");
    expect(submitted.tracks[0].verification.label).toMatch(/awaiting email/i);
  });

  it("always exposes a last-update line + timeline from real events", () => {
    const c = cards([jobWithConed("JT", "layout_issued")]).cards[0];
    const t = c.tracks[0];
    expect(t.lastUpdate.text).toContain("MC-JT");
    expect(t.timeline.length).toBeGreaterThan(0);
    expect(t.timeline[t.timeline.length - 1].state).toBe("now");
  });

  it("filterOpenCaseCards('needs') keeps only needs-attention cards", () => {
    const { cards: out } = cards([
      jobWithConed("JB", "docs_pending"),
      jobWithConed("JOK", "layout_issued"),
    ]);
    expect(filterOpenCaseCards(out, "needs").map((c) => c.jobId)).toEqual(["JB"]);
    expect(filterOpenCaseCards(out, "all")).toHaveLength(2);
  });
});

describe("rails + tones", () => {
  it("maps every stage onto the compact rail with a current bead", () => {
    const steps = buildRailSteps("coned", "initial_inspection", "inspect");
    expect(steps).toHaveLength(CONED_RAIL.length);
    expect(steps[3].state).toBe("current");
    expect(steps[2].state).toBe("done");
    const dob = buildRailSteps("dob", "signed_off", "done");
    expect(dob).toHaveLength(DOB_RAIL.length);
    expect(dob.every((s) => s.state === "done")).toBe(true);
  });

  it("tones: done for passed/terminal, action for blocked, inspect for inspections", () => {
    expect(trackTone({ agency: "coned", stage: "meter_turn_on", stageBucket: "Terminal", health: "ok" })).toBe("done");
    expect(trackTone({ agency: "coned", stage: "docs_pending", stageBucket: "Waiting-on-us", health: "blocked-by-us" })).toBe("action");
    expect(trackTone({ agency: "coned", stage: "final_inspection", stageBucket: "Scheduled", health: "ok" })).toBe("inspect");
    expect(trackTone({ agency: "dob", stage: "permit_issued", stageBucket: "Open", health: "ok" })).toBe("review");
  });
});
