// @vitest-environment jsdom
// Per-account auto-incrementing check numbers — every generate burns a number,
// burned numbers are NEVER reissued, counters persist and MAX-merge from cloud.
import { afterEach, describe, expect, it } from "vitest";
import {
  CHECKMAKER_COUNTERS_KEY,
  getCheckCounters,
  hydrateCheckCountersFromCloud,
  lastCheckNumberFor,
  nextCheckNumberFor,
  recordCheckNumberUsed,
} from "../src/lib/appSettings.js";

const acct = { id: "blz-chase", startCheckNo: "1001" };

afterEach(() => {
  localStorage.clear();
});

describe("nextCheckNumberFor", () => {
  it("starts at the account's starting number when nothing was generated yet", () => {
    expect(nextCheckNumberFor(acct)).toBe("1001");
    expect(nextCheckNumberFor({ id: "x", startCheckNo: "7005" })).toBe("7005");
  });

  it("defaults to 1001 with no/invalid startCheckNo", () => {
    expect(nextCheckNumberFor({ id: "x" })).toBe("1001");
    expect(nextCheckNumberFor({ id: "x", startCheckNo: "abc" })).toBe("1001");
  });

  it("advances by one after each generate: 1001, 1002, 1003 — no repeats", () => {
    const seen = new Set();
    for (const expected of ["1001", "1002", "1003"]) {
      const n = nextCheckNumberFor(acct);
      expect(n).toBe(expected);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
      recordCheckNumberUsed(acct.id, n);
    }
  });

  it("counters are per account — one account's burn does not move another's", () => {
    recordCheckNumberUsed("blz-chase", "1001");
    expect(nextCheckNumberFor({ id: "other-acct", startCheckNo: "500" })).toBe("500");
    expect(nextCheckNumberFor(acct)).toBe("1002");
  });

  it("raising the starting number jumps forward to match real check stock", () => {
    recordCheckNumberUsed(acct.id, "1003");
    expect(nextCheckNumberFor({ ...acct, startCheckNo: "2000" })).toBe("2000");
  });

  it("lowering the starting number can NEVER cause a reuse", () => {
    recordCheckNumberUsed(acct.id, "1003");
    expect(nextCheckNumberFor({ ...acct, startCheckNo: "1" })).toBe("1004");
  });

  it("a manual out-of-order high number burns everything up to it", () => {
    recordCheckNumberUsed(acct.id, "1500"); // user typed 1500 manually
    expect(nextCheckNumberFor(acct)).toBe("1501");
    // recording an OLDER number afterwards must not move the counter back
    recordCheckNumberUsed(acct.id, "1002");
    expect(nextCheckNumberFor(acct)).toBe("1501");
  });
});

describe("persistence + cloud merge", () => {
  it("survives a reload (persisted in localStorage under the counters key)", () => {
    recordCheckNumberUsed(acct.id, "1005");
    const raw = JSON.parse(localStorage.getItem(CHECKMAKER_COUNTERS_KEY));
    expect(raw["blz-chase"]).toBe(1005);
    // a fresh read (as after reload) sees the same state
    expect(lastCheckNumberFor(acct.id)).toBe(1005);
    expect(nextCheckNumberFor(acct)).toBe("1006");
  });

  it("cloud hydrate MAX-merges per account so neither device reissues a number", () => {
    recordCheckNumberUsed("a", "1010");
    recordCheckNumberUsed("b", "300");
    hydrateCheckCountersFromCloud({ a: 1004, b: 350, c: 9 });
    expect(getCheckCounters()).toEqual({ a: 1010, b: 350, c: 9 });
  });

  it("ignores junk cloud data", () => {
    recordCheckNumberUsed("a", "10");
    hydrateCheckCountersFromCloud({ a: "not-a-number", "": 5, b: -3 });
    expect(getCheckCounters()).toEqual({ a: 10 });
  });
});
