// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const listJobsMeta = vi.fn();
const scheduleJobsDiskCacheWrite = vi.fn();

vi.mock("../src/data/adapter.js", () => ({
  default: {
    listJobsMeta: (...args) => listJobsMeta(...args),
  },
}));

vi.mock("../src/lib/jobsDiskCache.js", () => ({
  scheduleJobsDiskCacheWrite: (...args) => scheduleJobsDiskCacheWrite(...args),
}));

describe("jobsBootWarm", () => {
  beforeEach(() => {
    vi.resetModules();
    listJobsMeta.mockReset();
    scheduleJobsDiskCacheWrite.mockReset();
  });

  it("warms listJobsMeta once and peeks the snapshot", async () => {
    const meta = {
      jobs: [{ id: "qbo-1", customer: "Acme" }],
      syncedAt: 10,
      stateTs: 11,
    };
    listJobsMeta.mockResolvedValue(meta);
    const mod = await import("../src/lib/jobsBootWarm.js");
    mod.setJobsBootWarmEnabledForTests(true);
    mod.resetJobsBootWarm();
    const p1 = mod.startJobsBootWarm();
    const p2 = mod.startJobsBootWarm();
    expect(p1).toBe(p2);
    const got = await p1;
    expect(got.jobs).toHaveLength(1);
    expect(mod.peekJobsBootWarm().jobs[0].id).toBe("qbo-1");
    expect(scheduleJobsDiskCacheWrite).toHaveBeenCalledTimes(1);
    expect(listJobsMeta).toHaveBeenCalledTimes(1);
    mod.setJobsBootWarmEnabledForTests(null);
  });

  it("returns null when listJobsMeta fails", async () => {
    listJobsMeta.mockRejectedValue(new Error("offline"));
    const mod = await import("../src/lib/jobsBootWarm.js");
    mod.setJobsBootWarmEnabledForTests(true);
    mod.resetJobsBootWarm();
    expect(await mod.startJobsBootWarm()).toBeNull();
    expect(mod.peekJobsBootWarm()).toBeNull();
    mod.setJobsBootWarmEnabledForTests(null);
  });
});
