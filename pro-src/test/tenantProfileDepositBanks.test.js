import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  depositBanksFromProfile,
  mergeProfile,
  normalizeDepositBanks,
} from "../src/lib/tenantProfile.js";

describe("tenantProfile deposit banks", () => {
  it("seeds deposit banks on the default company profile", () => {
    expect(DEFAULT_PROFILE.depositBanks).toEqual([
      "Martin Dorkin",
      "Wells Fargo",
      "BLZ Chase",
    ]);
  });

  it("mergeProfile keeps custom deposit banks", () => {
    const p = mergeProfile({ depositBanks: ["Bank A", "Bank B"] });
    expect(p.depositBanks).toEqual(["Bank A", "Bank B"]);
  });

  it("normalizeDepositBanks accepts newlines and commas", () => {
    expect(normalizeDepositBanks("A\nB, C")).toEqual(["A", "B", "C"]);
  });

  it("depositBanksFromProfile falls back to seed when empty", () => {
    expect(depositBanksFromProfile({ depositBanks: [] })).toEqual(DEFAULT_PROFILE.depositBanks);
  });
});
