import { describe, expect, it } from "vitest";
import {
  detectOpenPermitApplication,
  hasOpenPermitApplication,
  isPaperworkPipeOn,
  isPermitStageTerminal,
  masterPipeTogglePatch,
  branchEnablePipePatch,
  openApplicationPipePatch,
  renewSchedulePatch,
  getRenewSchedule,
} from "../src/lib/permitThreeSurfacePipe.js";
import { buildPermitBoard } from "../src/lib/permitsBoard.js";

const BASE = {
  id: "local-mispah",
  customer: "Mispah 1",
  serviceAddress: "1378 Bedford Ave",
};

describe("permitThreeSurfacePipe", () => {
  it("terminal stages do not auto-open", () => {
    expect(isPermitStageTerminal("coned", "meter_turn_on")).toBe(true);
    expect(isPermitStageTerminal("coned", "passed_complete")).toBe(true);
    expect(isPermitStageTerminal("coned", "docs_pending")).toBe(false);
    expect(isPermitStageTerminal("city", "signed_off")).toBe(true);
    expect(isPermitStageTerminal("city", "permit_issued")).toBe(false);
  });

  it("detects open Con Ed case and open DOB job", () => {
    const coned = {
      ...BASE,
      paperwork: { coned: { caseNumber: "MC-941580", currentStage: "docs_pending" } },
    };
    expect(hasOpenPermitApplication(coned)).toBe(true);
    expect(detectOpenPermitApplication(coned).coned).toBe(true);

    const dob = {
      ...BASE,
      paperwork: { dob: { jobNumber: "B01337723-I1-EL", currentStage: "permit_issued" } },
    };
    expect(hasOpenPermitApplication(dob)).toBe(true);
    expect(detectOpenPermitApplication(dob).dob).toBe(true);

    const done = {
      ...BASE,
      paperwork: {
        coned: { caseNumber: "MC-1", currentStage: "meter_turn_on", stageBucket: "Terminal" },
      },
    };
    expect(hasOpenPermitApplication(done)).toBe(false);
  });

  it("master toggle ON seeds Con Ed + DOB and appears on Permits board", () => {
    const patch = masterPipeTogglePatch(BASE, true);
    expect(patch.permitTracker).toBe(true);
    expect(patch.paperwork.coned.enabled).toBe(true);
    expect(patch.paperwork.dob.enabled).toBe(true);
    expect(patch.status.Paperwork.s).toBe("done");

    const job = {
      ...BASE,
      ...patch,
      paperwork: { ...(BASE.paperwork || {}), ...patch.paperwork },
      permits: patch.permits,
      status: { ...(BASE.status || {}), ...patch.status },
    };
    expect(isPaperworkPipeOn(job)).toBe(true);

    const board = buildPermitBoard({
      jobs: [job],
      insights: [],
      config: {
        agencies: [
          { id: "coned", label: "Con Edison" },
          { id: "dob", label: "DOB" },
        ],
      },
    });
    expect(board.sections.find((s) => s.agency === "coned")?.cases?.length).toBeGreaterThan(0);
    expect(board.sections.find((s) => s.agency === "dob")?.cases?.length).toBeGreaterThan(0);
  });

  it("branch enable uses the same permits[] seed as master", () => {
    const coned = branchEnablePipePatch(BASE, "coned", true);
    expect(coned.permitTracker).toBe(true);
    expect(coned.paperwork.coned.enabled).toBe(true);
    expect(coned.permits?.some((p) => p.agency === "coned")).toBe(true);

    const dob = branchEnablePipePatch(BASE, "dob", true);
    expect(dob.paperwork.dob.enabled).toBe(true);
    expect(dob.permits?.some((p) => p.agency === "city")).toBe(true);
  });

  it("tracker seed alone is not an open application", () => {
    const seedOnly = {
      ...BASE,
      paperwork: {
        coned: {
          enabled: true,
          currentStage: "application_filed",
          stageLabel: "On permit tracker",
        },
      },
    };
    expect(hasOpenPermitApplication(seedOnly)).toBe(false);
    expect(openApplicationPipePatch(seedOnly)).toBeNull();
  });

  it("open application auto-opens pipe (toggle + Progress + board)", () => {
    const job = {
      ...BASE,
      paperwork: {
        coned: { caseNumber: "MC-999", currentStage: "layout_issued", stageBucket: "Open" },
      },
    };
    expect(isPaperworkPipeOn(job)).toBe(false);
    const pipe = openApplicationPipePatch(job);
    expect(pipe).toBeTruthy();
    expect(pipe.permitTracker).toBe(true);
    expect(pipe.paperwork.coned.enabled).toBe(true);

    const linked = {
      ...job,
      permitTracker: true,
      paperwork: {
        ...job.paperwork,
        coned: { ...job.paperwork.coned, enabled: true },
        permitTracker: true,
      },
      status: { Paperwork: { s: "done", d: "2026-08-06" } },
      permits: pipe.permits || [
        {
          agency: "coned",
          primaryKey: "MC-999",
          currentStage: "layout_issued",
          stageBucket: "Open",
        },
      ],
    };
    // Already connected → no further patch
    expect(openApplicationPipePatch(linked)).toBeNull();
    expect(isPaperworkPipeOn(linked)).toBe(true);

    const board = buildPermitBoard({
      jobs: [linked],
      insights: [],
      config: { agencies: [{ id: "coned", label: "Con Edison" }] },
    });
    const row = board.sections.find((s) => s.agency === "coned")?.cases?.[0];
    expect(row?.caseNumber || linked.paperwork.coned.caseNumber).toMatch(/MC-999/);
  });

  it("renew schedule flag mirrors job paperwork ↔ permits[]", () => {
    const job = {
      ...BASE,
      paperwork: { dob: { enabled: true, jobNumber: "B01" } },
      permits: [{ agency: "city", primaryKey: "B01", currentStage: "permit_issued" }],
    };
    expect(getRenewSchedule(job, "dob")).toBe(false);
    const patch = renewSchedulePatch(job, { on: true, agency: "dob" });
    expect(patch.paperwork.dob.renewSchedule.on).toBe(true);
    expect(patch.paperwork.dob.renewSchedule.autoEmail).toBe(false);
    expect(patch.permits[0].renewSchedule.on).toBe(true);

    const next = {
      ...job,
      paperwork: { dob: { ...job.paperwork.dob, ...patch.paperwork.dob } },
      permits: patch.permits,
    };
    expect(getRenewSchedule(next, "dob")).toBe(true);
  });
});
