// Unit tests for the permits board + Con Ed backfill (pure logic).
import { describe, it, expect } from "vitest";
import {
  buildPermitBoard,
  isActionNeeded,
  agencyLabel,
  agencyOrder,
  foldConedForJob,
} from "../src/lib/permitsBoard.js";
import { computeConedBackfill } from "../src/lib/permitBackfill.js";

const JOB = (id, over = {}) => ({ id, customer: `Cust ${id}`, serviceAddress: `${id} Main St`, ...over });

const conedInsight = (over = {}) => ({
  id: over.id || `ei-${Math.random().toString(36).slice(2)}`,
  status: "auto_applied",
  agency: "coned",
  source: {
    from: "Con Edison <cpms.noreply@coned.com>",
    subject: over.subject || "Con Edison Case Number MC-910413 - Final Inspection Scheduled",
    receivedAt: over.receivedAt || "Wed, 22 Jul 2026 11:15:36 -0400",
    messageId: over.messageId || "m1",
  },
  summary: over.summary || "",
  emailSnippet: over.emailSnippet || "",
  dateTime: over.dateTime || "2026-08-04T09:00",
  jobId: over.jobId || "J-1",
  ...(over.extra || {}),
});

const LE_CONFIG = {
  modules: { permits: true },
  agencies: [
    { id: "dob", label: "DOB" },
    { id: "coned", label: "Con Edison" },
  ],
};

describe("agency labels + order", () => {
  it("prefers the tenant's own preset label and collapses city→dob", () => {
    expect(agencyLabel(LE_CONFIG, "coned")).toBe("Con Edison");
    expect(agencyLabel(LE_CONFIG, "city")).toBe("DOB"); // city canonicalizes to dob
    expect(agencyLabel({ agencies: [] }, "coned")).toBe("Con Edison"); // fallback
  });
  it("orders configured agencies first, always includes the NYC pair", () => {
    const order = agencyOrder(LE_CONFIG);
    expect(order).toContain("coned");
    expect(order).toContain("dob");
  });
});

describe("buildPermitBoard — Con Ed derivation", () => {
  it("derives a Con Ed case from an applied insight with no persisted data", () => {
    const board = buildPermitBoard({
      jobs: [JOB("J-1")],
      insights: [conedInsight({ jobId: "J-1" })],
      config: LE_CONFIG,
    });
    const coned = board.sections.find((s) => s.agency === "coned");
    expect(coned.cases).toHaveLength(1);
    expect(coned.cases[0].caseNumber).toBe("MC-910413");
    expect(coned.cases[0].stage).toBe("final_inspection");
    expect(coned.cases[0].stageBucket).toBe("Scheduled");
    expect(coned.cases[0].jobId).toBe("J-1");
  });

  it("only counts applied insights (pending/ignored are excluded)", () => {
    const board = buildPermitBoard({
      jobs: [JOB("J-1")],
      insights: [conedInsight({ jobId: "J-1", extra: { status: "ignored" } })],
      config: LE_CONFIG,
    });
    expect(board.counts.total).toBe(0);
  });

  it("puts a docs-pending (waiting-on-us) case in the action-needed strip", () => {
    const board = buildPermitBoard({
      jobs: [JOB("J-9")],
      insights: [
        conedInsight({
          id: "todo",
          jobId: "J-9",
          subject: "Status Update for Customer To-Do List - MC-936877",
        }),
      ],
      config: LE_CONFIG,
    });
    expect(board.actionNeeded).toHaveLength(1);
    expect(board.actionNeeded[0].health).toBe("blocked-by-us");
    expect(isActionNeeded(board.actionNeeded[0])).toBe(true);
  });

  it("folds multiple insights for the same job into one advancing case", () => {
    const folded = foldConedForJob(JOB("J-1"), [
      conedInsight({ jobId: "J-1", receivedAt: "Mon, 20 Jul 2026 09:00:00 -0400", subject: "Con Edison Case Number MC-910413 - Acknowledgment Letter" }),
      conedInsight({ jobId: "J-1", receivedAt: "Wed, 22 Jul 2026 11:00:00 -0400", subject: "Con Edison Case Number MC-910413 - Final Inspection Scheduled" }),
    ]);
    const coned = folded.permits.filter((p) => p.agency === "coned");
    expect(coned).toHaveLength(1); // same MC merged, not duplicated
    expect(coned[0].currentStage).toBe("final_inspection"); // advanced to the later stage
  });
});

describe("buildPermitBoard — City/DOB interim projection", () => {
  it("projects an applied City inspection insight into a read-only row", () => {
    const cityInsight = {
      id: "city-1",
      status: "auto_applied",
      agency: "city",
      appointmentType: "inspection",
      outcome: "scheduled",
      dobJobNumber: "M01228312",
      dateTime: "2026-08-10T10:00",
      address: "503 Schenectady Ave",
      source: { subject: "M01228312/I1 inspection", receivedAt: "Tue, 21 Jul 2026 08:00:00 -0400" },
      jobId: "J-1",
    };
    const board = buildPermitBoard({ jobs: [JOB("J-1")], insights: [cityInsight], config: LE_CONFIG });
    const dob = board.sections.find((s) => s.agency === "dob");
    expect(dob.cases).toHaveLength(1);
    expect(dob.cases[0].caseNumber).toBe("M01228312");
    expect(dob.cases[0].stageLabel).toBe("Inspection scheduled");
    expect(dob.cases[0].interim).toBe(true);
  });
});

describe("computeConedBackfill — idempotent", () => {
  it("plans a write for a job with no persisted Con Ed record", () => {
    const plan = computeConedBackfill({ jobs: [JOB("J-1")], insights: [conedInsight({ jobId: "J-1" })] });
    expect(plan).toHaveLength(1);
    expect(plan[0].jobId).toBe("J-1");
    expect(plan[0].patch.paperwork.coned.caseNumber).toBe("MC-910413");
  });

  it("is a no-op once the folded result is already persisted", () => {
    const insights = [conedInsight({ jobId: "J-1" })];
    const plan1 = computeConedBackfill({ jobs: [JOB("J-1")], insights });
    // Apply the plan into the job, then re-plan → nothing left to do.
    const persisted = JOB("J-1", { permits: plan1[0].patch.permits, paperwork: plan1[0].patch.paperwork });
    const plan2 = computeConedBackfill({ jobs: [persisted], insights });
    expect(plan2).toHaveLength(0);
  });

  it("skips insights whose job isn't loaded", () => {
    const plan = computeConedBackfill({ jobs: [JOB("OTHER")], insights: [conedInsight({ jobId: "MISSING" })] });
    expect(plan).toHaveLength(0);
  });
});
