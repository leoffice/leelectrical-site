import { describe, expect, it } from "vitest";
import {
  extractMcNumber,
  classifyConedMessageType,
  stageForConedEvent,
  mergeConedStage,
  shouldMarkFinalChecklistDone,
  paperworkStepsForStage,
  buildConedPermitFromEmail,
  conedPatchFromInsight,
  jobPatchFromConedPermit,
  mergePermitList,
} from "../src/lib/conedPermit.js";

describe("conedPermit — keys & types", () => {
  it("extracts MC case numbers from subject/body", () => {
    expect(extractMcNumber("Con Edison Case Number MC-910413 - Final Inspection Scheduled")).toBe(
      "MC-910413"
    );
    expect(extractMcNumber("Case Number : MC-936877")).toBe("MC-936877");
    expect(extractMcNumber("MC 926577 deposit")).toBe("MC-926577");
    expect(extractMcNumber("no case here")).toBe("");
  });

  it("classifies core ConEd lifecycle emails", () => {
    expect(
      classifyConedMessageType(
        "ConEdison Case Number MC-936877 - Acknowledgment Letter",
        "We have received your request for the above referenced location"
      )
    ).toBe("coned.acknowledgment");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
        "Your Final Inspection is scheduled on Jul 21, 2026 at 10:30 AM ."
      )
    ).toBe("coned.final_scheduled");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-910413-Final Inspection Reminder",
        "friendly reminder of an upcoming Final Inspection appointment on Jul 21, 2026 at 10:30 AM ."
      )
    ).toBe("coned.final_reminder");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-926577 2421 DEAN ST – Final Inspection Appointment Completed",
        "Your Final Inspection passed on Thursday, May 21, 2026 ."
      )
    ).toBe("coned.final_passed");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-915619 51 CHESTER ST – Initial Inspection Appointment Completed",
        "was completed on Wednesday, March 25, 2026"
      )
    ).toBe("coned.initial_completed");

    expect(
      classifyConedMessageType("MC-926577 - Deposit Payment Required_Contractor", "Please remit deposit")
    ).toBe("coned.deposit_required");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-910413 - PERFORM FINAL INSPECTION Available",
        "Final inspection is now available to schedule"
      )
    ).toBe("coned.final_available");

    expect(
      classifyConedMessageType(
        "Con Edison Case Number MC-915619 – Failed Final Inspection ",
        "the work was incomplete or out of compliance"
      )
    ).toBe("coned.final_failed");
  });

  it("maps event types to stages", () => {
    expect(stageForConedEvent("coned.acknowledgment")).toBe("application_filed");
    expect(stageForConedEvent("coned.initial_completed")).toBe("final_checklist_wait");
    expect(stageForConedEvent("coned.final_available")).toBe("ready_for_final");
    expect(stageForConedEvent("coned.final_scheduled")).toBe("final_inspection");
    expect(stageForConedEvent("coned.final_passed")).toBe("passed_complete");
    expect(stageForConedEvent("coned.deposit_required")).toBe("deposit_due");
  });
});

describe("conedPermit — stage merge & final checklist", () => {
  it("does not regress stages on noisy re-parse", () => {
    expect(mergeConedStage("final_inspection", "application_filed")).toBe("final_inspection");
    expect(mergeConedStage("final_inspection", "passed_complete")).toBe("passed_complete");
    expect(mergeConedStage("final_inspection", "failed_rework")).toBe("failed_rework");
  });

  it("marks Final checklist done when inspection date is confirmed (Levi)", () => {
    expect(shouldMarkFinalChecklistDone("coned.final_scheduled", "final_inspection")).toBe(true);
    expect(shouldMarkFinalChecklistDone("coned.final_available", "ready_for_final")).toBe(true);
    expect(shouldMarkFinalChecklistDone("coned.final_reminder", "final_inspection")).toBe(true);
    expect(shouldMarkFinalChecklistDone("coned.initial_scheduled", "initial_inspection")).toBe(false);
    expect(shouldMarkFinalChecklistDone("coned.acknowledgment", "application_filed")).toBe(false);
  });

  it("paperwork steps fill forward; Final checklist only at ready-for-final+", () => {
    const early = paperworkStepsForStage("initial_inspection");
    expect(early["Application submitted"]).toBe(true);
    expect(early["Interim checklist"]).toBe(true);
    expect(early["Final checklist"]).toBeUndefined();

    const finalReady = paperworkStepsForStage("ready_for_final");
    expect(finalReady["Final checklist"]).toBe(true);

    const finalSched = paperworkStepsForStage("final_inspection");
    expect(finalSched["Final checklist"]).toBe(true);
  });
});

describe("conedPermit — end-to-end samples (research addresses)", () => {
  it("503 Schenectady final scheduled → final_inspection + checklist done", () => {
    const permit = buildConedPermitFromEmail({
      subject: "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
      body: "Your Final Inspection is scheduled on Jul 21, 2026 at 10:30 AM . Service Address 503 SCHENECTADY AVE",
      address: "503 Schenectady Ave",
      dateTime: "2026-07-21T10:30",
      jobId: "job-503",
    });
    expect(permit.primaryKey).toBe("MC-910413");
    expect(permit.currentStage).toBe("final_inspection");
    expect(permit.stageBucket).toBe("Scheduled");

    const piece = jobPatchFromConedPermit(permit, { dateTime: "2026-07-21T10:30" });
    expect(piece.paperwork.coned.steps["Final checklist"]).toBe(true);
    expect(piece.paperwork.coned.dates["Inspection appointment"]).toBe("2026-07-21T10:30");
    expect(piece.paperwork.coned.caseNumber).toBe("MC-910413");
    expect(piece.paperwork.coned.stageLabel).toMatch(/Final inspection/i);
  });

  it("2421 Dean final passed → passed_complete", () => {
    const permit = buildConedPermitFromEmail({
      subject: "Con Edison Case Number MC-926577 2421 DEAN ST – Final Inspection Appointment Completed",
      body: "Your Final Inspection passed on Thursday, May 21, 2026 .",
      address: "2421 Dean St",
      dateTime: "2026-05-21T00:00",
    });
    expect(permit.currentStage).toBe("passed_complete");
    expect(permit.stageBucket).toBe("Passed");
  });

  it("initial completed → final_checklist_wait (death zone)", () => {
    const permit = buildConedPermitFromEmail({
      subject: "Con Edison Case Number MC-915619 51 CHESTER ST – Initial Inspection Appointment Completed",
      body: "was completed on Wednesday, March 25, 2026",
    });
    expect(permit.currentStage).toBe("final_checklist_wait");
    expect(permit.health).toBe("blocked-by-us");
    expect(permit.nextAction).toMatch(/Final checklist/i);
  });

  it("conedPatchFromInsight merges onto job", () => {
    const insight = {
      agency: "coned",
      appointmentType: "inspection",
      dateTime: "2026-07-21T10:30",
      address: "503 Schenectady Ave",
      source: {
        from: "CPMS.noreply@coned.com",
        subject: "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
        messageId: "m1",
      },
      emailSnippet:
        "Your Final Inspection is scheduled on Jul 21, 2026 at 10:30 AM . Case Number MC-910413",
      summary: "Final Inspection Scheduled",
    };
    const job = { id: "qbo-503", paperwork: {}, permits: [] };
    const patch = conedPatchFromInsight(insight, job);
    expect(patch).toBeTruthy();
    expect(patch.permits[0].primaryKey).toBe("MC-910413");
    expect(patch.paperwork.coned.steps["Final checklist"]).toBe(true);
    expect(patch.paperwork.coned.enabled).toBe(true);

    // Second email advances same permit
    const passInsight = {
      ...insight,
      source: {
        ...insight.source,
        subject: "Con Edison Case Number MC-910413 – Final Inspection Appointment Completed",
        messageId: "m2",
      },
      emailSnippet: "Your Final Inspection passed on Tuesday, July 21, 2026.",
      outcome: "completed",
    };
    const job2 = {
      id: "qbo-503",
      paperwork: patch.paperwork,
      permits: patch.permits,
    };
    const patch2 = conedPatchFromInsight(passInsight, job2);
    expect(patch2.permits).toHaveLength(1);
    expect(patch2.permits[0].currentStage).toBe("passed_complete");
    expect(patch2.permits[0].events.length).toBeGreaterThanOrEqual(2);
  });

  it("mergePermitList replaces same MC", () => {
    const a = { id: "p1", agency: "coned", primaryKey: "MC-1", currentStage: "application_filed", events: [] };
    const b = {
      id: "p1",
      agency: "coned",
      primaryKey: "MC-1",
      currentStage: "final_inspection",
      events: [{ eventType: "coned.final_scheduled" }],
    };
    const list = mergePermitList([a], b);
    expect(list).toHaveLength(1);
    expect(list[0].currentStage).toBe("final_inspection");
  });
});
