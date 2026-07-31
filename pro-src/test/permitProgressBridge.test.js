import { describe, expect, it } from "vitest";
import {
  PERMIT_STAGE_TO_JOB_STATUS,
  jobStagesForPermitStage,
  jobStatusPatchFromPermitStage,
  jobStatusPatchFromJobPermits,
  mergeStatusPatches,
  leadingPermitStage,
  dobPaperworkStepsForStage,
} from "../src/lib/permitProgressBridge.js";
import { jobPatchFromConedPermit, conedPatchFromInsight } from "../src/lib/conedPermit.js";
import { jobPatchFromCityPermit, cityPatchFromInsight } from "../src/lib/cityPermit.js";
import { jobPatchForInsight } from "../src/lib/applyEmailInsight.js";
import { computePermitBackfill } from "../src/lib/permitBackfill.js";

describe("permitProgressBridge — mapping table", () => {
  it("maps city filing → Paperwork only", () => {
    expect(jobStagesForPermitStage("filing_submitted")).toEqual(["Paperwork"]);
    expect(jobStagesForPermitStage("permit_issued")).toEqual(["Paperwork"]);
  });

  it("maps inspection scheduled → Paperwork + Scheduled", () => {
    expect(jobStagesForPermitStage("inspection_scheduled")).toEqual([
      "Paperwork",
      "Scheduled",
    ]);
    expect(jobStagesForPermitStage("final_inspection")).toEqual([
      "Paperwork",
      "Scheduled",
    ]);
  });

  it("maps passed / signed off / Con Ed passed → Done cumulative", () => {
    expect(jobStagesForPermitStage("inspection_passed")).toEqual([
      "Paperwork",
      "Scheduled",
      "Done",
    ]);
    expect(jobStagesForPermitStage("signed_off")).toEqual([
      "Paperwork",
      "Scheduled",
      "Done",
    ]);
    expect(jobStagesForPermitStage("passed_complete")).toEqual([
      "Paperwork",
      "Scheduled",
      "Done",
    ]);
  });

  it("table is the single editable source (keys cover both agencies)", () => {
    expect(PERMIT_STAGE_TO_JOB_STATUS.inspection_passed).toBeTruthy();
    expect(PERMIT_STAGE_TO_JOB_STATUS.passed_complete).toBeTruthy();
    expect(PERMIT_STAGE_TO_JOB_STATUS.application_filed).toBeTruthy();
  });
});

describe("permitProgressBridge — non-destructive status patch", () => {
  it("sets done with milestone date", () => {
    const p = jobStatusPatchFromPermitStage("inspection_passed", {
      date: "2026-07-30",
      existingStatus: {},
    });
    expect(p.status.Paperwork).toEqual({ s: "done", d: "2026-07-30" });
    expect(p.status.Scheduled).toEqual({ s: "done", d: "2026-07-30" });
    expect(p.status.Done).toEqual({ s: "done", d: "2026-07-30" });
  });

  it("does not un-check or overwrite done/skipped", () => {
    const p = jobStatusPatchFromPermitStage("inspection_passed", {
      date: "2026-07-30",
      existingStatus: {
        Paperwork: { s: "skipped", d: "2026-01-01" },
        Scheduled: { s: "done", d: "2026-07-01" },
        Done: { s: "" },
      },
    });
    expect(p.status.Paperwork).toBeUndefined();
    expect(p.status.Scheduled).toBeUndefined();
    expect(p.status.Done).toEqual({ s: "done", d: "2026-07-30" });
  });

  it("is idempotent when already fully cleared", () => {
    const p = jobStatusPatchFromPermitStage("passed_complete", {
      date: "2026-07-30",
      existingStatus: {
        Paperwork: { s: "done", d: "2026-06-01" },
        Scheduled: { s: "done", d: "2026-06-15" },
        Done: { s: "done", d: "2026-07-01" },
      },
    });
    expect(p).toEqual({});
  });

  it("mergeStatusPatches keeps cleared stages", () => {
    const m = mergeStatusPatches(
      { status: { Paperwork: { s: "done", d: "2026-01-01" } } },
      { status: { Paperwork: { s: "done", d: "2026-07-30" }, Done: { s: "done", d: "2026-07-30" } } }
    );
    expect(m.status.Paperwork.d).toBe("2026-01-01");
    expect(m.status.Done.d).toBe("2026-07-30");
  });
});

describe("jobPatchFromConedPermit — status bridge", () => {
  it("passed_complete flips Paperwork + Scheduled + Done", () => {
    const permit = {
      currentStage: "passed_complete",
      primaryKey: "MC-1",
      stageBucket: "Passed",
      health: "ok",
      nextAction: "Passed",
      nextActionDate: "2026-07-30",
      events: [{ eventType: "coned.final_passed" }],
    };
    const piece = jobPatchFromConedPermit(permit, {
      dateTime: "2026-07-30T10:00",
      existingStatus: {},
    });
    expect(piece.paperwork.coned.currentStage).toBe("passed_complete");
    expect(piece.status.Done.s).toBe("done");
    expect(piece.status.Done.d).toBe("2026-07-30");
    expect(piece.status.Paperwork.s).toBe("done");
    expect(piece.status.Scheduled.s).toBe("done");
  });

  it("conedPatchFromInsight includes status on final scheduled", () => {
    const insight = {
      agency: "coned",
      appointmentType: "inspection",
      dateTime: "2026-07-21T10:30",
      source: {
        from: "CPMS.noreply@coned.com",
        subject: "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
      },
      emailSnippet: "Your Final Inspection is scheduled. Case Number MC-910413",
    };
    const patch = conedPatchFromInsight(insight, { id: "j1", status: {}, paperwork: {}, permits: [] });
    expect(patch.status.Scheduled.s).toBe("done");
    expect(patch.status.Paperwork.s).toBe("done");
    expect(patch.status.Done).toBeUndefined();
  });
});

describe("jobPatchFromCityPermit — status bridge + DOB auto-add", () => {
  it("inspection_passed flips Progress Done", () => {
    const permit = {
      currentStage: "inspection_passed",
      primaryKey: "M01228312/I1",
      stageBucket: "Passed",
      health: "ok",
      nextActionDate: "2026-07-30T10:00",
      events: [],
    };
    const piece = jobPatchFromCityPermit(permit, {
      dateTime: "2026-07-30T10:00",
      existingStatus: { Paperwork: { s: "" } },
    });
    expect(piece.paperwork.dob.enabled).toBe(true);
    expect(piece.paperwork.dob.steps["Inspection scheduled"]).toBe(true);
    expect(piece.status.Done).toEqual({ s: "done", d: "2026-07-30" });
  });

  it("DOB application email auto-adds permit + Paperwork progress", () => {
    const insight = {
      agency: "city",
      dobJobNumber: "M09999999",
      appointmentType: "other",
      source: {
        from: "dobnowdonotreply@buildings.nyc.gov",
        subject: "Filing submitted - Job Number M09999999",
        messageId: "msg-new",
      },
      emailSnippet: "Your filing was submitted. Job Number M09999999 at 100 Main St",
      address: "100 Main St",
    };
    const patch = cityPatchFromInsight(insight, { id: "job-new", permits: [], status: {} });
    expect(patch.permit.primaryKey).toBe("M09999999");
    expect(patch.permit.currentStage).toBe("filing_submitted");
    expect(patch.permits).toHaveLength(1);
    expect(patch.paperwork.dob.enabled).toBe(true);
    expect(patch.status.Paperwork.s).toBe("done");
  });

  it("149 E 116 — passed inspection yesterday via city insight", () => {
    // Existing scheduled permit on the estimate job (real prod shape)
    const job = {
      id: "qbo-est-25435",
      address: "149 East 116 Street",
      status: { Paperwork: { s: "" } },
      paperwork: {
        dob: {
          enabled: true,
          dates: { "Inspection scheduled": "2026-07-30T10:00" },
        },
      },
      permits: [
        {
          id: "permit-city-M01228312I1",
          agency: "city",
          primaryKey: "M01228312/I1",
          currentStage: "inspection_scheduled",
          nextActionDate: "2026-07-30T10:00",
          events: [],
        },
      ],
    };
    const insight = {
      agency: "city",
      dobJobNumber: "M01228312/I1",
      appointmentType: "inspection",
      outcome: "completed",
      dateTime: "2026-07-30T10:00",
      address: "149 East 116 Street, Manhattan, NY 10029",
      source: {
        from: "dobnowdonotreply@buildings.nyc.gov",
        subject: "Electrical Inspection Results - Job Number M01228312/I1 /149 EAST 116 STREET",
        messageId: "pass-msg",
      },
      emailSnippet:
        "Your electrical inspection passed on 7/30/2026. Job Number M01228312/I1 at 149 EAST 116 STREET",
    };
    const patch = cityPatchFromInsight(insight, job);
    expect(patch.permit.currentStage).toBe("inspection_passed");
    expect(patch.status.Done.s).toBe("done");
    expect(patch.status.Done.d).toBe("2026-07-30");
    expect(patch.status.Paperwork.s).toBe("done");
    expect(patch.status.Scheduled.s).toBe("done");
  });
});

describe("jobPatchForInsight — city + coned both bridge", () => {
  it("city completed inspection reflects on job progress", () => {
    const insight = {
      agency: "city",
      dobJobNumber: "M01228312/I1",
      appointmentType: "inspection",
      outcome: "completed",
      dateTime: "2026-07-30T10:00",
      source: {
        from: "dobnowdonotreply@buildings.nyc.gov",
        subject: "Electrical Inspection Results - Job Number M01228312/I1 passed",
      },
      emailSnippet: "inspection passed satisfactory Job Number M01228312/I1",
    };
    const selected = new Set(["paperwork_inspection"]);
    const patch = jobPatchForInsight(insight, selected, {
      id: "qbo-est-25435",
      status: {},
      permits: [],
    });
    expect(patch.permits[0].currentStage).toBe("inspection_passed");
    expect(patch.status.Done.s).toBe("done");
  });
});

describe("computePermitBackfill — job.status", () => {
  it("backfills Progress when permit is ahead of job.status", () => {
    const jobs = [
      {
        id: "j-gap",
        customer: "Gap Co",
        status: { Paperwork: { s: "" }, Done: { s: "" } },
        permits: [
          {
            agency: "city",
            primaryKey: "M1",
            currentStage: "inspection_passed",
            nextActionDate: "2026-07-30",
          },
        ],
      },
    ];
    const plan = computePermitBackfill({ jobs, insights: [] });
    expect(plan.length).toBe(1);
    expect(plan[0].statusFlipped).toEqual(
      expect.arrayContaining(["Paperwork", "Scheduled", "Done"])
    );
    expect(plan[0].patch.status.Done.d).toBe("2026-07-30");
  });

  it("idempotent when Progress already matches permit", () => {
    const jobs = [
      {
        id: "j-ok",
        status: {
          Paperwork: { s: "done", d: "2026-07-01" },
          Scheduled: { s: "done", d: "2026-07-15" },
          Done: { s: "done", d: "2026-07-30" },
        },
        permits: [
          {
            agency: "city",
            primaryKey: "M2",
            currentStage: "inspection_passed",
            nextActionDate: "2026-07-30",
          },
        ],
      },
    ];
    const plan = computePermitBackfill({ jobs, insights: [] });
    expect(plan).toHaveLength(0);
  });
});

describe("dobPaperworkStepsForStage", () => {
  it("fills forward to inspection scheduled", () => {
    const s = dobPaperworkStepsForStage("inspection_scheduled");
    expect(s["Permit issued"]).toBe(true);
    expect(s["Inspection scheduled"]).toBe(true);
  });
});

describe("leadingPermitStage", () => {
  it("picks the furthest stage", () => {
    expect(
      leadingPermitStage([
        { currentStage: "filing_submitted" },
        { currentStage: "inspection_passed" },
      ])
    ).toBe("inspection_passed");
  });
});
