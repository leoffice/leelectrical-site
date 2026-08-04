import { describe, expect, it } from "vitest";
import {
  findJobForConedCase,
  jobPatchLinkConedCase,
  planConedCaseJobLinks,
  collectOpenConedCasesFromInsights,
} from "../src/lib/conedCaseLink.js";

describe("conedCaseLink", () => {
  const jobs = [
    {
      id: "qbo-19949",
      serviceAddress: "1127 Lincoln Pl, Brooklyn, NY 11213",
      paperwork: { coned: {} },
    },
  ];

  it("matches 1127 Lincoln Place to the emergency invoice job", () => {
    const { job, score } = findJobForConedCase(jobs, {
      caseNumber: "MC-941412",
      address: "1127 LINCOLN PLACE, BROOKLYN, NY 11213",
    });
    expect(job?.id).toBe("qbo-19949");
    expect(score).toBeGreaterThanOrEqual(0.72);
  });

  it("plans a link patch when case is missing on job", () => {
    const cases = [
      { caseNumber: "MC-941412", address: "1127 Lincoln Place Brooklyn NY 11213" },
    ];
    const plan = planConedCaseJobLinks({ jobs, cases });
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0].patch.paperwork.coned.caseNumber).toBe("MC-941412");
    expect(plan.creates).toHaveLength(0);
  });

  it("proposes create when no job matches", () => {
    const plan = planConedCaseJobLinks({
      jobs: [],
      cases: [{ caseNumber: "MC-999999", address: "999 Nowhere St Brooklyn NY 11213" }],
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].fields.paperwork.coned.caseNumber).toBe("MC-999999");
  });

  it("collects MC numbers from insights", () => {
    const cases = collectOpenConedCasesFromInsights([
      {
        id: "i1",
        address: "1127 Lincoln Place",
        source: { subject: "ConEdison Case Number MC-941412 - Acknowledgment Letter" },
        emailSnippet: "Service At: 1127 Lincoln Place Case No: MC-941412",
      },
    ]);
    expect(cases.some((c) => c.caseNumber === "MC-941412")).toBe(true);
  });

  it("jobPatchLink is null when already linked", () => {
    const job = {
      id: "j1",
      paperwork: { coned: { caseNumber: "MC-941412" } },
    };
    expect(jobPatchLinkConedCase(job, "MC-941412")).toBeNull();
  });
});
