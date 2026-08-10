/**
 * Case next-step recommender — 1337 President / just-opened flow.
 */
import { describe, it, expect } from "vitest";
import {
  recommendCaseNextSteps,
  resolveCaseStage,
  CASE_FOLLOWUP_MS,
  caseNextActionLabel,
} from "../src/lib/caseNextSteps.js";
import { buildPermitBoard } from "../src/lib/permitsBoard.js";

const JOB_1337 = {
  id: "local-1785688750694",
  customer: "Sholom Rubashkin",
  serviceAddress: "1337 President St",
  paperwork: {
    coned: {
      enabled: true,
      caseNumber: "MC-941580",
      currentStage: "application_filed",
      stageLabel: "Application filed",
      submittedAt: "2026-08-03T14:00:00.000Z",
    },
  },
};

describe("resolveCaseStage", () => {
  it("reads paperwork stage / case number as application_filed", () => {
    expect(resolveCaseStage(JOB_1337)).toBe("application_filed");
    expect(
      resolveCaseStage({
        paperwork: { coned: { caseNumber: "MC-1" } },
      })
    ).toBe("application_filed");
  });
});

describe("recommendCaseNextSteps — just-opened case (1337)", () => {
  it("flags optional new meter + required electrical permit as due now", () => {
    const rec = recommendCaseNextSteps(JOB_1337, {
      now: Date.parse("2026-08-03T15:00:00.000Z"),
    });
    expect(rec.stage).toBe("application_filed");
    const byId = Object.fromEntries(rec.steps.map((s) => [s.id, s]));
    expect(byId.new_meter.required).toBe(false);
    expect(byId.new_meter.status).toBe("due");
    expect(byId.electrical_permit.required).toBe(true);
    expect(byId.electrical_permit.status).toBe("due");
    expect(byId.final_checklist.status).toBe("blocked");
    expect(byId.final_checklist.gate).toMatch(/electrical|account/i);
    expect(rec.dueNow.map((s) => s.id)).toEqual(
      expect.arrayContaining(["new_meter", "electrical_permit"])
    );
    expect(rec.recommended?.id).toBe("electrical_permit");
    expect(rec.summary).toMatch(/Electrical permit/i);
  });

  it("blocks final checklist until account active even after electrical permit", () => {
    const job = {
      ...JOB_1337,
      paperwork: {
        coned: { ...JOB_1337.paperwork.coned },
        todos: [
          {
            id: "file_electrical_permit:job",
            kind: "file_electrical_permit",
            status: "done",
          },
        ],
      },
    };
    const rec = recommendCaseNextSteps(job, {
      now: Date.parse("2026-08-03T15:00:00.000Z"),
    });
    const checklist = rec.steps.find((s) => s.id === "final_checklist");
    expect(checklist.status).toBe("blocked");
    expect(checklist.gate).toBe("account_active");
    expect(rec.steps.find((s) => s.id === "electrical_permit").status).toBe("done");
  });

  it("after DOB permit done on open case → Full Detailed → Energy Services due", () => {
    const job = {
      ...JOB_1337,
      paperwork: {
        coned: { ...JOB_1337.paperwork.coned },
        todos: [
          {
            id: "file_electrical_permit:job",
            kind: "file_electrical_permit",
            status: "done",
          },
        ],
      },
    };
    const rec = recommendCaseNextSteps(job, {
      now: Date.parse("2026-08-03T15:00:00.000Z"),
    });
    const upload = rec.steps.find((s) => s.id === "coned_submit_electrical_permit");
    expect(upload).toBeTruthy();
    expect(upload.status).toBe("due");
    expect(upload.required).toBe(true);
    expect(upload.note).toMatch(/Full Detailed/i);
    expect(rec.recommended?.id).toBe("coned_submit_electrical_permit");
  });

  it("Full Detailed on Energy Services marked done after upload flag", () => {
    const job = {
      ...JOB_1337,
      paperwork: {
        coned: {
          ...JOB_1337.paperwork.coned,
          electricalPermitOnCase: true,
        },
        todos: [
          {
            id: "file_electrical_permit:job",
            kind: "file_electrical_permit",
            status: "done",
          },
        ],
      },
    };
    const rec = recommendCaseNextSteps(job, {
      now: Date.parse("2026-08-03T15:00:00.000Z"),
    });
    const upload = rec.steps.find((s) => s.id === "coned_submit_electrical_permit");
    expect(upload.status).toBe("done");
    expect(rec.recommended?.id).not.toBe("coned_submit_electrical_permit");
  });

  it("on deposit email: remind customer only (no card capture)", () => {
    const job = {
      ...JOB_1337,
      paperwork: {
        coned: {
          ...JOB_1337.paperwork.coned,
          currentStage: "deposit_due",
          deposit: { emailReceived: true, status: "due" },
        },
      },
    };
    const rec = recommendCaseNextSteps(job);
    const dep = rec.steps.find((s) => s.id === "deposit_customer_followup");
    expect(dep.status).toBe("due");
    expect(dep.note).toMatch(/Remind only/i);
    expect(rec.recommended?.id).toBe("deposit_customer_followup");
  });

  it("after final pass + 1 week without install date → inquiry due", () => {
    const passedAt = "2026-07-20T12:00:00.000Z";
    const job = {
      ...JOB_1337,
      paperwork: {
        coned: {
          ...JOB_1337.paperwork.coned,
          currentStage: "passed_complete",
          finalInspection: { result: "passed", passedAt },
        },
      },
    };
    const rec = recommendCaseNextSteps(job, {
      now: Date.parse(passedAt) + CASE_FOLLOWUP_MS + 1000,
    });
    const inq = rec.steps.find((s) => s.id === "post_pass_inquiry");
    expect(inq.status).toBe("due");
    expect(inq.title).toMatch(/install date/i);
  });

  it("caseNextActionLabel prefers recommendation summary", () => {
    // Freeze clock to just after case open so deposit_watch is not yet "due"
    // (weekAfterSubmit flips after CASE_FOLLOWUP_MS and ranks above permit).
    const label = caseNextActionLabel(
      {
        ...JOB_1337,
        // recommendCaseNextSteps reads Date.now unless caller freezes via options —
        // caseNextActionLabel has no now arg; use a job that still needs permit
        // and has no deposit gate yet (submittedAt = "now" for week check).
        paperwork: {
          coned: {
            ...JOB_1337.paperwork.coned,
            submittedAt: new Date().toISOString(),
          },
        },
      }
    );
    expect(label).toMatch(/Electrical permit/i);
  });
});

describe("buildPermitBoard attaches recommendations", () => {
  it("puts 1337-style case in action-needed with due steps", () => {
    const board = buildPermitBoard({
      jobs: [JOB_1337],
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
    expect(coned.cases).toHaveLength(1);
    const row = coned.cases[0];
    expect(row.caseNumber).toBe("MC-941580");
    expect(row.dueNow?.length).toBeGreaterThanOrEqual(2);
    expect(row.nextAction).toMatch(/Electrical permit|due/i);
    expect(board.actionNeeded.some((r) => r.caseNumber === "MC-941580")).toBe(true);
  });
});

describe("case walk 2026-08-03 — Lincoln / Kingston / 37th", () => {
  it("Lincoln: existing accounts → due Add PLP, then electrical permit blocked until PLP", () => {
    const job = {
      id: "qbo-19949",
      customer: "izzy",
      serviceAddress: "1127 Lincoln Pl",
      paperwork: {
        coned: {
          enabled: true,
          caseNumber: "MC-941412",
          currentStage: "application_filed",
          existingAccount: true,
          accountActive: true,
          existingAccounts: 2,
          targetAccounts: 3,
          needsPlpAccount: true,
          needsAdditionalAccount: true,
          additionalAccountLabel: "PLP",
        },
      },
    };
    const rec = recommendCaseNextSteps(job);
    const byId = Object.fromEntries(rec.steps.map((s) => [s.id, s]));
    expect(byId.add_plp_account.status).toBe("due");
    expect(byId.add_plp_account.required).toBe(true);
    expect(byId.electrical_permit.status).toBe("blocked");
    expect(byId.electrical_permit.gate).toBe("add_plp_account");
    expect(rec.recommended?.id).toBe("add_plp_account");
    expect(rec.summary).toMatch(/PLP/i);
    expect(byId.deposit?.status).toBe("done");
  });

  it("Kingston: inquiry response → email customer next", () => {
    const job = {
      id: "qbo-251798",
      customer: "Itzchak Dayan",
      serviceAddress: "564 Kingston Ave",
      email: "itzikdayan1@gmail.com",
      paperwork: {
        coned: {
          enabled: true,
          caseNumber: "MC-913358",
          currentStage: "docs_pending",
          inquiry: {
            id: "CI-1309319",
            responseReceived: true,
            customerFollowUpNeeded: true,
          },
        },
      },
    };
    const rec = recommendCaseNextSteps(job);
    expect(rec.recommended?.id).toBe("inquiry_customer_followup");
    expect(rec.summary).toMatch(/inquiry|Email customer/i);
  });

  it("146 E 37th: ready to close after final pass", () => {
    const job = {
      id: "qbo-231575",
      customer: "Sholom Piekarski",
      serviceAddress: "146 E 37th St",
      paperwork: {
        coned: {
          enabled: true,
          caseNumber: "MC-803966",
          currentStage: "passed_complete",
          readyToClose: true,
          finalInspection: { result: "passed", passedAt: "2026-07-15T12:00:00.000Z" },
        },
      },
    };
    const rec = recommendCaseNextSteps(job);
    expect(rec.recommended?.id).toBe("close_case");
    expect(rec.summary).toMatch(/Close case/i);
  });

  it("service done, no permits → request inspection blocked until skill learned", () => {
    const job = {
      id: "local-service-only",
      paperwork: {
        coned: { serviceCompleteNoPermit: true },
      },
    };
    const rec = recommendCaseNextSteps(job);
    expect(rec.steps[0]?.id).toBe("request_inspection_after_service");
    expect(rec.steps[0]?.status).toBe("blocked");
    expect(rec.steps[0]?.gate).toBe("skill_not_learned");
  });
});
