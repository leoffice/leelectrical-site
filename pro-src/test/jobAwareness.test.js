import { describe, expect, it } from "vitest";
import { jobAwarenessBubbles, needsAttentionJob } from "../src/lib/jobAwareness.js";

describe("needsAttentionJob", () => {
  it("flags open invoices and incomplete sell/billing stages", () => {
    expect(needsAttentionJob({ status: {}, paid: false })).toBe(true);
    expect(needsAttentionJob({ status: {}, paid: false, invoiceNo: "99" })).toBe(true);
    const cleared = { Estimate: { s: "done" }, Invoiced: { s: "done" } };
    expect(needsAttentionJob({ status: cleared, paid: false })).toBe(false);
  });

  it("ignores paid, archived, and deleted jobs", () => {
    expect(needsAttentionJob({ status: {}, paid: true })).toBe(false);
    expect(needsAttentionJob({ status: {}, paid: false, _archived: true })).toBe(false);
    expect(needsAttentionJob({ status: {}, paid: false, _deleted: true })).toBe(false);
  });

  it("flags overdue follow-ups and enabled paperwork steps", () => {
    expect(
      needsAttentionJob({ status: {}, paid: false, followUp: { date: "2000-01-01" } }, "2026-07-08")
    ).toBe(true);
    expect(
      needsAttentionJob(
        {
          status: { Estimate: { s: "done" }, Invoiced: { s: "done" } },
          paid: false,
          paperwork: { dob: { enabled: true, steps: {} } },
        },
        "2026-07-08"
      )
    ).toBe(true);
  });
});

describe("jobAwarenessBubbles", () => {
  it("shows sell and billing bubbles until cleared", () => {
    const bubbles = jobAwarenessBubbles({ status: {}, paid: false }, [], []);
    const keys = bubbles.map((b) => b.key);
    expect(keys).toContain("stage-estimate");
    expect(keys).toContain("stage-invoiced");
    expect(bubbles.find((b) => b.key === "stage-estimate")?.branchLabel).toBe("Sell");
    expect(bubbles.find((b) => b.key === "stage-invoiced")?.branchLabel).toBe("Billing");
  });

  it("hides completed paperwork branches", () => {
    const job = {
      status: { Estimate: { s: "done" }, Invoiced: { s: "done" } },
      paid: false,
      paperwork: {
        dob: {
          enabled: true,
          steps: {
            "Permit issued": true,
            "Inspection requested": true,
            "Inspection scheduled": true,
            "Self certification": true,
            "PAA complete": true,
          },
        },
      },
    };
    expect(jobAwarenessBubbles(job, [], []).some((b) => b.branchKey === "dob")).toBe(false);
  });
});