/**
 * Skill completion paper trail — mark Permits tab + email + reply trigger.
 */
import { describe, it, expect } from "vitest";
import {
  skillCompletionJobPatch,
  buildSkillCompletionEmail,
  parseSkillReportReply,
  finalizeSkillCompletion,
  skillActionLabel,
  SKILL_REPORT_TAG,
  SKILL_REPORT_REPLY_TOKEN,
} from "../src/lib/skillCompletionReport.js";
import {
  recommendCaseNextSteps,
  caseStepCompletePatch,
} from "../src/lib/caseNextSteps.js";

const JOB_1337 = {
  id: "local-1785688750694",
  customer: "Goodness and kindness",
  serviceAddress: "1337 President St, Brooklyn, NY 11213",
  paperwork: {
    coned: {
      enabled: true,
      caseNumber: "MC-941580",
      currentStage: "application_filed",
    },
    todos: [],
  },
};

describe("skillActionLabel", () => {
  it("maps create/update/paid verbs", () => {
    expect(skillActionLabel("created")).toBe("Created");
    expect(skillActionLabel("updated")).toBe("Updated");
    expect(skillActionLabel("paid")).toBe("Paid + issued");
    expect(skillActionLabel("issued")).toBe("Issued");
  });
});

describe("caseStepCompletePatch — electrical_permit", () => {
  it("marks DOB electrical permit done with permit number", () => {
    const p = caseStepCompletePatch("electrical_permit", {
      permitNumber: "B01442468-I1-EL",
      action: "issued",
    });
    expect(p.paperwork.dob.electricalPermit.status).toBe("done");
    expect(p.paperwork.dob.permitNumber).toBe("B01442468-I1-EL");
    expect(p.paperwork.dob.currentStage).toBe("permit_issued");
  });
});

describe("skillCompletionJobPatch", () => {
  it("marks Create electrical permit done after DOB skill", () => {
    const patch = skillCompletionJobPatch({
      skill: "dob-file-electrical-permit",
      job: JOB_1337,
      result: {
        action: "issued",
        permitNumber: "B01442468-I1-EL",
        jobNumber: "B01442468",
        feePaid: 147.5,
        cityPay: "CPY057136852",
        conedUploaded: true,
        conedCase: "MC-941580",
        fullDetailedSaved: true,
      },
    });
    expect(patch).toBeTruthy();
    expect(patch.paperwork.dob.electricalPermit.status).toBe("done");
    expect(patch.paperwork.dob.permitNumber).toMatch(/B01442468/);
    expect(
      patch.paperwork.todos.some(
        (t) => t.kind === "file_electrical_permit" && t.status === "done"
      )
    ).toBe(true);
    expect(patch.paperwork.coned.electricalPermitOnCase).toBe(true);
    expect(patch.paperwork.skillReports?.length).toBe(1);

    const merged = {
      ...JOB_1337,
      paperwork: {
        ...JOB_1337.paperwork,
        ...patch.paperwork,
        coned: { ...JOB_1337.paperwork.coned, ...patch.paperwork.coned },
        dob: patch.paperwork.dob,
        todos: patch.paperwork.todos,
      },
    };
    const rec = recommendCaseNextSteps(merged);
    const ep = rec.steps.find((st) => st.id === "electrical_permit");
    expect(ep.status).toBe("done");
    expect(ep.title).toMatch(/Electrical permit/i);
    const upload = rec.steps.find((st) => st.id === "coned_submit_electrical_permit");
    expect(upload.status).toBe("done");
  });

  it("does not leave Create electrical permit as due", () => {
    const patch = skillCompletionJobPatch({
      skill: "dob-file-electrical-permit",
      job: JOB_1337,
      result: { action: "updated", permitNumber: "B01442468-I1-EL" },
    });
    const merged = {
      ...JOB_1337,
      paperwork: {
        ...JOB_1337.paperwork,
        dob: patch.paperwork.dob,
        todos: patch.paperwork.todos,
        coned: JOB_1337.paperwork.coned,
      },
    };
    const rec = recommendCaseNextSteps(merged);
    const ep = rec.steps.find((st) => st.id === "electrical_permit");
    expect(ep.status).toBe("done");
    expect(ep.title).not.toMatch(/Create/i);
  });
});

describe("buildSkillCompletionEmail", () => {
  it("paper trail subject + open items + reply token", () => {
    const { email, job: merged } = finalizeSkillCompletion({
      skill: "dob-file-electrical-permit",
      job: JOB_1337,
      result: {
        action: "issued",
        permitNumber: "B01442468-I1-EL",
        feePaid: 147.5,
        conedUploaded: true,
        conedCase: "MC-941580",
        fullDetailedSaved: true,
      },
    });
    expect(email.subject).toContain(SKILL_REPORT_TAG);
    expect(email.subject).toMatch(/1337 President/i);
    expect(email.subject).toMatch(/B01442468/);
    expect(email.body).toMatch(/What was done/i);
    expect(email.body).toContain(SKILL_REPORT_REPLY_TOKEN);
    expect(email.body).toMatch(/job=local-1785688750694/);
    expect(email.kind).toBe("skill_completion_report");
    // After permit + ES upload, next open is often final checklist / meter / etc.
    expect(Array.isArray(email.openItems)).toBe(true);
    expect(merged.paperwork.dob.electricalPermit.status).toBe("done");
  });

  it("lists explicit incomplete items when provided", () => {
    const email = buildSkillCompletionEmail({
      skill: "dob-file-electrical-permit",
      job: JOB_1337,
      result: {
        action: "updated",
        permitNumber: "B01442468-I1-EL",
        incomplete: ["Upload Full Detailed to Energy Services"],
      },
      openItems: ["Upload Full Detailed to Energy Services"],
    });
    expect(email.body).toMatch(/Still open/);
    expect(email.body).toMatch(/Upload Full Detailed/);
    expect(email.body).toMatch(/Reply to this email/);
  });
});

describe("parseSkillReportReply", () => {
  it("parses Levi reply as work trigger", () => {
    const parsed = parseSkillReportReply({
      subject: `Re: ${SKILL_REPORT_TAG} · Issued · 1337 President St · B01442468-I1-EL`,
      body: [
        "Finish the meter app upload too",
        "",
        "On Mon, Israel wrote:",
        `> ${SKILL_REPORT_REPLY_TOKEN} job=local-1785688750694 skill=dob-file-electrical-permit permit=B01442468-I1-EL`,
      ].join("\n"),
    });
    expect(parsed).toBeTruthy();
    expect(parsed.isReply).toBe(true);
    expect(parsed.jobId).toBe("local-1785688750694");
    expect(parsed.skill).toBe("dob-file-electrical-permit");
    expect(parsed.permit).toBe("B01442468-I1-EL");
    expect(parsed.instruction).toMatch(/meter/i);
    expect(parsed.trigger).toBe("skill_report_reply");
  });

  it("returns null for unrelated mail", () => {
    expect(
      parseSkillReportReply({
        subject: "Invoice #1",
        body: "Please pay",
      })
    ).toBeNull();
  });
});
