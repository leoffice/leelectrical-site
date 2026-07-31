import { describe, expect, it } from "vitest";
import {
  buildWorkCompleteCustomerEmail,
  isDobWorkCompleteText,
  jobHasWorkCompleteMilestone,
} from "../src/lib/workCompleteNotify.js";
import { classifyCityMessageType, stageForCityEvent, cityPatchFromInsight } from "../src/lib/cityPermit.js";
import { jobPatchForInsight } from "../src/lib/applyEmailInsight.js";
import { classifyEmailOutcome } from "../src/lib/emailInsight.js";

describe("isDobWorkCompleteText", () => {
  it("detects Work Complete + status updated to Complete", () => {
    expect(
      isDobWorkCompleteText(
        "Work Complete for M01228312/I1/149 EAST 116 STREET",
        "status updated to Complete"
      )
    ).toBe(true);
    expect(isDobWorkCompleteText("Inspection Scheduled", "see you tomorrow")).toBe(false);
  });
});

describe("jobHasWorkCompleteMilestone", () => {
  it("true for city signed_off permit", () => {
    expect(
      jobHasWorkCompleteMilestone({
        permits: [{ agency: "city", primaryKey: "M1", currentStage: "signed_off" }],
      })
    ).toBe(true);
  });
  it("true for paperwork.dob signed_off", () => {
    expect(
      jobHasWorkCompleteMilestone({
        paperwork: { dob: { currentStage: "signed_off" } },
        permits: [],
      })
    ).toBe(true);
  });
  it("false for inspection_passed only", () => {
    expect(
      jobHasWorkCompleteMilestone({
        permits: [{ agency: "city", currentStage: "inspection_passed" }],
      })
    ).toBe(false);
  });
});

describe("buildWorkCompleteCustomerEmail", () => {
  it("mentions work complete + invoice number", () => {
    const e = buildWorkCompleteCustomerEmail({
      customer: "Abe Cohen",
      invoiceNo: "25435",
      serviceAddress: "149 East 116 Street, Manhattan",
    });
    expect(e.subject).toMatch(/Work complete/i);
    expect(e.subject).toMatch(/25435/);
    expect(e.body).toMatch(/officially complete/i);
    expect(e.body).toMatch(/signed off/i);
    expect(e.body).toMatch(/invoice #25435/i);
    expect(e.body).toMatch(/Hi Abe/);
    expect(e.kind).toBe("invoice");
  });
});

describe("§5 end-to-end Work Complete → bridge", () => {
  it("classifiers + jobPatchForInsight land signed_off and Progress Done", () => {
    const subj = "Work Complete for M01228312/I1/149 EAST 116 STREET";
    const body =
      "Work Complete for M01228312/I1/149 EAST 116 STREET. Job status updated to Complete.";
    expect(classifyEmailOutcome(subj, body)).toBe("completed");
    expect(classifyCityMessageType(subj, body)).toBe("city.signed_off");
    expect(stageForCityEvent("city.signed_off")).toBe("signed_off");

    const insight = {
      agency: "city",
      dobJobNumber: "M01228312/I1",
      outcome: "completed",
      appointmentType: "other",
      dateTime: "2026-07-31T09:00",
      address: "149 East 116 Street",
      source: {
        from: "dobnowdonotreply@buildings.nyc.gov",
        subject: subj,
        messageId: "wc-1",
      },
      emailSnippet: body,
    };
    const selected = new Set(["paperwork_inspection"]);
    const patch = jobPatchForInsight(insight, selected, {
      id: "qbo-est-25435",
      status: {},
      permits: [
        {
          agency: "city",
          primaryKey: "M01228312/I1",
          currentStage: "inspection_passed",
        },
      ],
    });
    expect(patch.permits[0].currentStage).toBe("signed_off");
    expect(patch.status.Done.s).toBe("done");
    expect(patch.status.Done.d).toBe("2026-07-31");
    expect(jobHasWorkCompleteMilestone({ ...patch, permits: patch.permits })).toBe(true);

    // cityPatch alone (auto-apply path without paperwork select) also bridges
    const brain = cityPatchFromInsight(insight, {
      id: "qbo-est-25435",
      status: {},
      permits: [{ agency: "city", primaryKey: "M01228312/I1", currentStage: "inspection_passed" }],
    });
    expect(brain.permit.currentStage).toBe("signed_off");
    expect(brain.status.Done.s).toBe("done");
  });
});
