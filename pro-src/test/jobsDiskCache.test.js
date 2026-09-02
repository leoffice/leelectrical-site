// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearJobsDiskCache,
  JOBS_DISK_MAX_AGE_MS,
  readJobsDiskCache,
  setJobsDiskCacheEnabledForTests,
  writeJobsDiskCache,
} from "../src/lib/jobsDiskCache.js";

describe("jobsDiskCache", () => {
  beforeEach(async () => {
    setJobsDiskCacheEnabledForTests(true);
    await clearJobsDiskCache();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await clearJobsDiskCache();
    setJobsDiskCacheEnabledForTests(null);
  });

  it("round-trips a slim jobs snapshot", async () => {
    const jobs = [
      { id: "qbo-1", customer: "Acme", amount: 100, _listProjection: true },
      { id: "qbo-2", customer: "Beta", amount: 200, _listProjection: true },
    ];
    const ok = await writeJobsDiskCache({ jobs, syncedAt: 42, stateTs: 99 });
    expect(ok).toBe(true);
    const got = await readJobsDiskCache();
    expect(got).toBeTruthy();
    expect(got.jobs).toHaveLength(2);
    expect(got.jobs[0].id).toBe("qbo-1");
    expect(got.syncedAt).toBe(42);
    expect(got.stateTs).toBe(99);
    expect(got.savedAt).toBeGreaterThan(0);
  });

  it("returns null for an empty write", async () => {
    expect(await writeJobsDiskCache({ jobs: [] })).toBe(false);
    expect(await readJobsDiskCache()).toBeNull();
  });

  it("ignores snapshots older than JOBS_DISK_MAX_AGE_MS", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const jobs = [{ id: "qbo-1", customer: "Old" }];
    await writeJobsDiskCache({ jobs, syncedAt: 1, stateTs: 1 });
    expect(await readJobsDiskCache()).toBeTruthy();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z").getTime() + JOBS_DISK_MAX_AGE_MS + 60_000);
    expect(await readJobsDiskCache()).toBeNull();
  });
});

