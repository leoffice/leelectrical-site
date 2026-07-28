// @vitest-environment jsdom
// The reminder badge recomputes in the store on every jobs/events/commands
// change. At LE's data size it took ~0.9s and blocked the whole shell, because
// job↔event scoring re-normalized the same strings jobs × events times
// (Levi 2026-07-28). Semantics must be identical; only the cost changed.
import { describe, expect, it } from "vitest";
import { suggestJobsForEvent } from "../src/lib/calendarLink.js";
import { activeReminderCount, buildReminderList } from "../src/lib/followUpReminders.js";

const TODAY = "2026-07-28";
const NOW = new Date("2026-07-28T10:00:00");

function makeJobs(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: "J-" + i,
    customer: "Customer " + (i % 300),
    businessName: "Customer " + (i % 300),
    title: "Job " + i,
    amount: "$" + (500 + i),
    invoiceNo: i % 3 === 0 ? String(16000 + i) : "",
    serviceAddress: 100 + (i % 400) + " Lincoln Place, Brooklyn, NY 11213",
    invoiceHistory: [],
    status: {},
  }));
}

function makeEvents(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: "ev-" + i,
    summary: (i % 3 === 0 ? "Con Edison inspection" : "Service call") + " " + i,
    start: TODAY + "T1" + (i % 8) + ":00:00",
    location: 100 + (i % 400) + " Lincoln Place",
    description: "",
  }));
}

describe("job ↔ event matching still matches the same things", () => {
  const jobs = [
    { id: "J-1", customer: "Peretz Chein", serviceAddress: "123 Main St, Brooklyn" },
    { id: "J-2", customer: "Other Guy", businessName: "Troy Electric", serviceAddress: "88 Troy Ave" },
    { id: "J-3", customer: "Nobody", serviceAddress: "9 Nowhere Rd", invoiceNo: "251841" },
    { id: "J-4", customer: "Archived", serviceAddress: "123 Main St", _archived: true },
    { id: "J-5", customer: "Deleted", serviceAddress: "123 Main St", _deleted: true },
  ];

  it("matches on customer name", () => {
    const hits = suggestJobsForEvent({ id: "e", summary: "Meet Peretz Chein" }, jobs);
    expect(hits.map((j) => j.id)).toContain("J-1");
  });

  it("matches on service address in the event location", () => {
    const hits = suggestJobsForEvent({ id: "e", summary: "Service call", location: "123 Main St" }, jobs);
    expect(hits[0].id).toBe("J-1");
  });

  it("matches on business name distinct from the customer", () => {
    const hits = suggestJobsForEvent({ id: "e", summary: "Troy Electric walkthrough" }, jobs);
    expect(hits.map((j) => j.id)).toContain("J-2");
  });

  it("matches on invoice number in the text", () => {
    const hits = suggestJobsForEvent({ id: "e", summary: "Re invoice 251841" }, jobs);
    expect(hits.map((j) => j.id)).toContain("J-3");
  });

  it("never suggests archived or deleted jobs", () => {
    const hits = suggestJobsForEvent({ id: "e", summary: "x", location: "123 Main St" }, jobs);
    expect(hits.map((j) => j.id)).not.toContain("J-4");
    expect(hits.map((j) => j.id)).not.toContain("J-5");
  });

  it("no match scores nothing", () => {
    expect(suggestJobsForEvent({ id: "e", summary: "zzz qqq" }, jobs)).toEqual([]);
  });

  it("a fresh jobs array is re-indexed, not served from a stale cache", () => {
    const before = suggestJobsForEvent({ id: "e", summary: "Renamed Co" }, jobs);
    expect(before).toEqual([]);
    const renamed = [{ ...jobs[0], customer: "Renamed Co" }, ...jobs.slice(1)];
    const after = suggestJobsForEvent({ id: "e", summary: "Renamed Co" }, renamed);
    expect(after.map((j) => j.id)).toContain("J-1");
  });
});

describe("reminder cost at LE's data size", () => {
  const jobs = makeJobs(1200);
  const events = makeEvents(400);

  it("the nav badge does not score soft matches it will never show", () => {
    const started = Date.now();
    activeReminderCount(events, jobs, TODAY, NOW, []);
    // Was ~900ms; a generous ceiling still catches a return of the O(n*m) bug
    // without being flaky on a loaded CI box.
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("building the full list with candidates stays well under a second", () => {
    const started = Date.now();
    const list = buildReminderList(events, jobs, TODAY, NOW, []);
    expect(Array.isArray(list)).toBe(true);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("candidates are present when asked for and absent when not", () => {
    const withCands = buildReminderList(events, jobs, TODAY, NOW, []);
    const without = buildReminderList(events, jobs, TODAY, NOW, [], { withCandidates: false });
    expect(withCands.length).toBe(without.length);
    const svcWith = withCands.find((x) => x.kind === "service_call");
    const svcWithout = without.find((x) => x.kind === "service_call");
    if (svcWith) {
      expect(Array.isArray(svcWith.suggestions)).toBe(true);
      expect(svcWithout.suggestions).toEqual([]);
    }
  });
});
