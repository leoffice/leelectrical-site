import { describe, expect, it, vi } from "vitest";
import {
  buildWeekGrid,
  elapsedMs,
  filterEntries,
  fmtDuration,
  groupEntriesByDay,
  jobTimeLabel,
  liveEmployees,
  startOfWeek,
  sumMsForJob,
} from "../src/lib/timeTrack.js";

describe("timeTrack helpers", () => {
  it("formats durations", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(45000)).toBe("45s");
    expect(fmtDuration(90 * 60000)).toBe("1h 30m");
    expect(fmtDuration(2 * 3600000 + 15 * 60000)).toBe("2h 15m");
  });

  it("elapsedMs counts from startedAt", () => {
    expect(elapsedMs(1000, 61000)).toBe(60000);
    expect(elapsedMs(null, 1000)).toBe(0);
  });

  it("jobTimeLabel combines customer and title", () => {
    expect(jobTimeLabel({ customer: "Jane", title: "Panel" })).toBe("Jane — Panel");
    expect(jobTimeLabel({ businessName: "ACME" })).toBe("ACME");
  });

  it("groups entries by day label", () => {
    const now = Date.now();
    const groups = groupEntriesByDay([
      { id: "1", endedAt: now },
      { id: "2", endedAt: now - 86400000 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0][1]).toHaveLength(1);
  });

  it("sums job hours", () => {
    expect(sumMsForJob([{ jobId: "j1", durationMs: 3600000 }, { jobId: "j2", durationMs: 1000 }], "j1")).toBe(3600000);
  });

  it("filters entries by job and employee", () => {
    const rows = filterEntries(
      [
        { employeeId: "e1", jobId: "j1", endedAt: 100 },
        { employeeId: "e2", jobId: "j1", endedAt: 200 },
      ],
      { employeeId: "e1", jobId: "j1" }
    );
    expect(rows).toHaveLength(1);
  });

  it("builds week grid with day totals", () => {
    const ws = startOfWeek();
    const grid = buildWeekGrid(
      [{ employeeId: "e1", startedAt: ws + 3600000, durationMs: 7200000, endedAt: ws + 10800000 }],
      [{ id: "e1", name: "Mike" }],
      ws
    );
    expect(grid.rows[0].weekMs).toBe(7200000);
  });

  it("liveEmployees flags recent heartbeat", () => {
    const now = Date.now();
    const rows = liveEmployees(
      { e1: { startedAt: now - 60000, lastSeen: now - 1000, kind: "shift" } },
      [{ id: "e1", name: "Mike", color: "#000" }],
      now
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].live).toBe(true);
    expect(rows[0].elapsed).toBe(60000);
  });


});