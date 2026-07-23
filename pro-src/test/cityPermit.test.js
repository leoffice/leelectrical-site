// Unit tests for the City / DOB NOW: Electrical permit brain.
import { describe, it, expect } from "vitest";
import {
  classifyCityMessageType,
  stageForCityEvent,
  mergeCityStage,
  extractDobNumber,
  cityStageHealth,
  isCityAgencyInsight,
  cityPatchFromInsight,
  CITY_STAGE_BUCKET,
} from "../src/lib/cityPermit.js";

describe("extractDobNumber", () => {
  it("parses the DOB NOW job-number shapes", () => {
    expect(extractDobNumber("Job Number M01228312/I1 /149 EAST")).toBe("M01228312/I1");
    expect(extractDobNumber("filing B01334914I1EL created")).toBe("B01334914I1EL");
    expect(extractDobNumber("no number here")).toBe("");
  });
});

describe("classifyCityMessageType + stageForCityEvent", () => {
  const cases = [
    ["Electrical Inspection Scheduled - Job Number M01228312/I1", "city.inspection_scheduled", "inspection_scheduled"],
    ["Electrical Inspection Results: Disapproved", "city.inspection_failed", "inspection_failed"],
    ["Inspection Results — Passed", "city.inspection_passed", "inspection_passed"],
    ["Objection raised — additional information required", "city.objections", "objections"],
    ["Electrical Work Permit Issued", "city.permit_issued", "permit_issued"],
    ["Letter of Completion issued", "city.signed_off", "signed_off"],
    ["Filing submitted — job number created", "city.filing_submitted", "filing_submitted"],
    ["Filing withdrawn", "city.cancelled", "cancelled"],
    ["Some unrelated DOB newsletter", "city.other", null],
  ];
  for (const [subj, evt, stage] of cases) {
    it(`"${subj}" → ${evt} → ${stage}`, () => {
      const e = classifyCityMessageType(subj, "");
      expect(e).toBe(evt);
      expect(stageForCityEvent(e)).toBe(stage);
    });
  }
});

describe("mergeCityStage + health", () => {
  it("advances by rank, but a fail drops from scheduled", () => {
    expect(mergeCityStage("filing_submitted", "permit_issued")).toBe("permit_issued");
    expect(mergeCityStage("inspection_scheduled", "filing_submitted")).toBe("inspection_scheduled"); // no regress
    expect(mergeCityStage("inspection_scheduled", "inspection_failed")).toBe("inspection_failed");
    expect(mergeCityStage("permit_issued", "cancelled")).toBe("cancelled"); // terminal sticky
  });
  it("flags objections + failed inspections as blocked-by-us", () => {
    expect(cityStageHealth("objections")).toBe("blocked-by-us");
    expect(cityStageHealth("inspection_failed")).toBe("blocked-by-us");
    expect(cityStageHealth("inspection_scheduled")).toBe("ok");
  });
});

describe("cityPatchFromInsight", () => {
  const insight = (over = {}) => ({
    id: "ci-1",
    status: "auto_applied",
    agency: "city",
    source: {
      from: "DOBNOW donotreply <dobnowdonotreply@buildings.nyc.gov>",
      subject: over.subject || "Electrical Inspection Scheduled - Job Number M01228312/I1 /149 EAST 116 ST",
      receivedAt: over.receivedAt || "Tue, 21 Jul 2026 08:00:00 -0400",
      messageId: "m1",
    },
    dateTime: over.dateTime || "2026-07-30T10:15",
    dobJobNumber: over.dobJobNumber || "M01228312/I1",
    jobId: "J-1",
  });

  it("recognizes DOB NOW agency + builds a city permit record with stage", () => {
    expect(isCityAgencyInsight(insight())).toBe(true);
    const patch = cityPatchFromInsight(insight(), { id: "J-1", permits: [] });
    expect(patch).toBeTruthy();
    expect(patch.permit.agency).toBe("city");
    expect(patch.permit.primaryKey).toBe("M01228312/I1");
    expect(patch.permit.currentStage).toBe("inspection_scheduled");
    expect(patch.permit.stageBucket).toBe(CITY_STAGE_BUCKET.inspection_scheduled);
    expect(patch.permits).toHaveLength(1);
  });

  it("returns null for a non-city insight", () => {
    const coned = { agency: "coned", source: { from: "cpms.noreply@coned.com", subject: "MC-1" }, status: "auto_applied" };
    expect(cityPatchFromInsight(coned, { id: "J-1", permits: [] })).toBeNull();
  });

  it("folds two DOB emails on one job into one advancing case", () => {
    let job = { id: "J-1", permits: [] };
    const p1 = cityPatchFromInsight(insight({ subject: "Filing submitted job number M01228312 created", receivedAt: "Mon, 20 Jul 2026 09:00:00 -0400", dateTime: "" }), job);
    job = { ...job, permits: p1.permits };
    const p2 = cityPatchFromInsight(insight({ subject: "Electrical Inspection Scheduled - Job Number M01228312/I1", receivedAt: "Tue, 21 Jul 2026 09:00:00 -0400" }), job);
    const city = p2.permits.filter((p) => p.agency === "city");
    expect(city).toHaveLength(1);
    expect(city[0].currentStage).toBe("inspection_scheduled");
  });
});
