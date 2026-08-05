import { describe, expect, it } from "vitest";
import {
  enableConedPermitTrackerPatch,
  enableDobPermitTrackerPatch,
  isOnPermitTracker,
  setPermitTrackerPatch,
} from "../src/lib/permitTrackerSeed.js";
import { buildPermitBoard } from "../src/lib/permitsBoard.js";

const JOB = {
  id: "local-carroll",
  customer: "Carroll Owner",
  serviceAddress: "1202 Carroll Street",
};

describe("permitTrackerSeed", () => {
  it("isOnPermitTracker false until enabled", () => {
    expect(isOnPermitTracker(JOB)).toBe(false);
    expect(isOnPermitTracker({ ...JOB, permitTracker: true })).toBe(true);
    expect(isOnPermitTracker({ ...JOB, paperwork: { coned: { enabled: true } } })).toBe(true);
  });

  it("enable Con Ed seeds tracker stage without wiping a real case", () => {
    const seeded = enableConedPermitTrackerPatch(JOB, true);
    expect(seeded.paperwork.coned.enabled).toBe(true);
    expect(seeded.paperwork.coned.currentStage).toBe("application_filed");
    expect(seeded.permits?.some((p) => p.agency === "coned")).toBe(true);

    const withCase = {
      ...JOB,
      paperwork: { coned: { caseNumber: "MC-1", currentStage: "docs_pending" } },
    };
    const keep = enableConedPermitTrackerPatch(withCase, true);
    expect(keep.paperwork.coned.enabled).toBe(true);
    expect(keep.paperwork.coned.currentStage).toBeUndefined();
  });

  it("enable DOB seeds city permit for the board", () => {
    const patch = enableDobPermitTrackerPatch(JOB, true);
    expect(patch.paperwork.dob.enabled).toBe(true);
    expect(patch.permits?.some((p) => p.agency === "city")).toBe(true);
  });

  it("setPermitTrackerPatch on → job appears on Con Ed + DOB board sections", () => {
    const patch = setPermitTrackerPatch(JOB, true);
    const job = {
      ...JOB,
      permitTracker: true,
      ...patch,
      paperwork: { ...(JOB.paperwork || {}), ...(patch.paperwork || {}) },
      permits: patch.permits,
    };
    const board = buildPermitBoard({
      jobs: [job],
      insights: [],
      config: {
        modules: { permits: true },
        agencies: [
          { id: "coned", label: "Con Edison" },
          { id: "dob", label: "DOB" },
        ],
      },
    });
    const coned = board.sections.find((s) => s.agency === "coned");
    const dob = board.sections.find((s) => s.agency === "dob");
    expect(coned?.cases?.length).toBeGreaterThan(0);
    expect(coned.cases[0].address).toMatch(/1202 Carroll/i);
    expect(dob?.cases?.length).toBeGreaterThan(0);
  });

  it("permitTracker flag alone (Dispatch path) still lists on Con Ed board", () => {
    const board = buildPermitBoard({
      jobs: [{ ...JOB, permitTracker: true }],
      insights: [],
      config: { agencies: [{ id: "coned", label: "Con Edison" }] },
    });
    const coned = board.sections.find((s) => s.agency === "coned");
    expect(coned?.cases?.[0]?.jobId).toBe("local-carroll");
    expect(coned.cases[0].stageLabel).toMatch(/permit tracker|On permit tracker|Application filed/i);
  });
});
