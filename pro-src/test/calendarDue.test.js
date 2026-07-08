import { describe, expect, it } from "vitest";
import {
  PAPERWORK_REMINDER_DAYS,
  addDays,
  bucketFollowUps,
  followUpFromPaperworkStep,
  isToDoJob,
  isUpcomingJob,
} from "../src/lib/calendarDue.js";
import { todayStr } from "../src/lib/format.js";

describe("calendarDue", () => {
  const today = "2026-07-07";
  const job = (id, date, extra = {}) => ({
    id,
    paid: false,
    followUp: { text: id, date },
    ...extra,
  });

  it("addDays shifts calendar dates", () => {
    expect(addDays("2026-07-07", 7)).toBe("2026-07-14");
    expect(addDays("2026-07-07", 1)).toBe("2026-07-08");
  });

  it("buckets follow-ups into overdue, today, tomorrow, next3, later", () => {
    const jobs = [
      job("a", "2026-07-05"),
      job("b", "2026-07-07"),
      job("c", "2026-07-08"),
      job("d", "2026-07-09"),
      job("e", "2026-07-20"),
      job("paid", "2026-07-07", { paid: true }),
    ];
    const b = bucketFollowUps(jobs, today);
    expect(b.overdue.map((j) => j.id)).toEqual(["a"]);
    expect(b.todayDue.map((j) => j.id)).toEqual(["b"]);
    expect(b.tomorrowDue.map((j) => j.id)).toEqual(["c"]);
    expect(b.next3.map((j) => j.id)).toEqual(["d"]);
    expect(b.later.map((j) => j.id)).toEqual(["e"]);
  });

  it("paperwork complete sets a 1-week paperwork follow-up", () => {
    const fu = followUpFromPaperworkStep("coned", "Application submitted");
    expect(fu.type).toBe("Paperwork / permits");
    expect(fu.text).toContain("Application submitted");
    expect(fu.text).toContain("Con Ed");
    expect(fu.date).toBe(addDays(todayStr(), PAPERWORK_REMINDER_DAYS));
    expect(fu.remind).toBe(true);

    const permit = followUpFromPaperworkStep("dob", "Permit issued");
    expect(permit.text).toContain("City permit");
  });

  it("To Do and Upcoming filters", () => {
    expect(isToDoJob(job("x", "2026-07-07"), today)).toBe(true);
    expect(isToDoJob(job("x", "2026-07-06"), today)).toBe(true);
    expect(isToDoJob(job("x", "2026-07-08"), today)).toBe(false);
    expect(isUpcomingJob({ paid: false, followUp: { date: "2026-07-10" } }, today)).toBe(true);
    expect(
      isUpcomingJob({ paid: false, status: { Scheduled: { s: "done", d: "2026-07-12" } } }, today)
    ).toBe(true);
  });
});