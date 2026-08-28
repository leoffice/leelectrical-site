import { describe, it, expect, beforeEach } from "vitest";
import {
  clearPolishLearningForTests,
  appendPolishLearningLocal,
  loadPolishLearning,
  polishLearningSimilarity,
  findBestLearnedPair,
  savePolishLearningEntry,
} from "../src/lib/workDescriptionPolishLearning.js";

beforeEach(() => {
  clearPolishLearningForTests();
});

describe("workDescriptionPolishLearning", () => {
  it("scores similar rough notes highly", () => {
    const a = "remove old equipment install 5 dedicated lines 150 ft cable";
    const b = "remove existing equipment install 5 dedicated lines roughly 150 ft of cables";
    expect(polishLearningSimilarity(a, b)).toBeGreaterThan(0.4);
    expect(polishLearningSimilarity(a, "unrelated panel bonding note")).toBeLessThan(0.3);
  });

  it("stores and retrieves a train pair", async () => {
    const entry = {
      raw: "We are going to remove the old panel.",
      polished: "• We are going to remove the old panel",
      edited: "Electrical work:\n• Remove existing panel\nWork performed in accordance with NEC and applicable local code requirements.",
      styleKey: "professional",
      jobId: "job-1",
    };
    const res = await savePolishLearningEntry(entry);
    expect(res.ok).toBe(true);
    const list = loadPolishLearning();
    expect(list).toHaveLength(1);
    expect(list[0].edited).toContain("Remove existing panel");
    const hit = findBestLearnedPair(entry.raw);
    expect(hit).toBeTruthy();
    expect(hit.edited).toBe(entry.edited);
  });

  it("replaces near-duplicate raw with the newest edit", () => {
    appendPolishLearningLocal({
      raw: "install 5 dedicated lines same floor 150 ft",
      polished: "old",
      edited: "first edit",
    });
    appendPolishLearningLocal({
      raw: "install 5 dedicated lines same floor 150 ft cables",
      polished: "old2",
      edited: "second edit",
    });
    const list = loadPolishLearning();
    expect(list.some((e) => e.edited === "second edit")).toBe(true);
  });
});
