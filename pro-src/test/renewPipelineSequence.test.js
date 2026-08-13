// renewPipeline + newAccountSequence — Actions-to-Deploy Phase 2 derivations.
import { describe, expect, it } from "vitest";
import { RENEW_PIPE_STEPS, renewPipelineState } from "../src/lib/renewPipeline.js";
import {
  NEW_ACCOUNT_STEPS,
  buildSequenceStepConfirmedPatch,
  buildSequenceStepFiredPatch,
  buildSequenceStepPayload,
  jobHasNewAccountSequence,
  newAccountSequenceState,
} from "../src/lib/newAccountSequence.js";

const T0 = Date.parse("2026-08-13T12:00:00Z");
const HOUR = 3600_000;

describe("renewPipelineState", () => {
  it("walks the whole pipeline in order", () => {
    expect(RENEW_PIPE_STEPS).toHaveLength(6);
    expect(renewPipelineState({}).key).toBe("expiring");
    expect(renewPipelineState({ noticeSent: true }).key).toBe("notified");
    expect(renewPipelineState({ noticeSent: true, invoiceMaterialized: true }).key).toBe("invoiced");
    expect(renewPipelineState({ noticeSent: true, invoiceMaterialized: true, paid: true }).key).toBe("paid");
    expect(
      renewPipelineState({ paid: true, deployStatus: "deploying", deployStartedAt: "2026-08-13" }).key
    ).toBe("renewing");
    expect(renewPipelineState({ paid: true, renewComplete: true }).key).toBe("completed");
    expect(renewPipelineState({ deployStatus: "done" }).idx).toBe(5);
  });
});

describe("new-account sequence engine", () => {
  const seqJob = () => ({
    id: "JN",
    customer: "New Meter",
    serviceAddress: "77 Java St",
    paperwork: { coned: { meterApplication: { value: "new_meter" } } },
  });

  it("only new-meter/new-application jobs run the sequence", () => {
    expect(jobHasNewAccountSequence(seqJob())).toBe(true);
    expect(jobHasNewAccountSequence({ paperwork: { coned: { meterApplication: { value: "existing" } } } })).toBe(false);
    expect(jobHasNewAccountSequence({})).toBe(false);
  });

  it("steps unlock strictly on confirmation — never on fire", () => {
    let job = seqJob();
    let st = newAccountSequenceState(job, { now: T0 });
    expect(st.steps.map((s) => s.phase)).toEqual(["ready", "locked", "locked", "locked"]);
    expect(st.currentIndex).toBe(0);

    // Fire step 1 → sent, step 2 still locked (no self-report advance)
    job = { ...job, ...buildSequenceStepFiredPatch(job, "submit_application", { now: T0 }) };
    st = newAccountSequenceState(job, { now: T0 + HOUR });
    expect(st.steps[0].phase).toBe("sent");
    expect(st.steps[1].phase).toBe("locked");

    // >24h unconfirmed → flagged
    st = newAccountSequenceState(job, { now: T0 + 25 * HOUR });
    expect(st.steps[0].phase).toBe("flagged");

    // Confirm step 1 → step 2 (account_activated) becomes current
    job = { ...job, ...buildSequenceStepConfirmedPatch(job, "submit_application", { now: T0 + 2 * HOUR }) };
    st = newAccountSequenceState(job, { now: T0 + 3 * HOUR });
    expect(st.steps[0].phase).toBe("done");
    expect(st.currentIndex).toBe(1);
    expect(st.steps[1].manualConfirm).toBe(true); // LEVI-DEFAULT #2

    // Confirm all remaining → complete
    for (const id of ["account_activated", "order_inspection", "final_checklist"]) {
      job = { ...job, ...buildSequenceStepConfirmedPatch(job, id, { now: T0 + 4 * HOUR }) };
    }
    st = newAccountSequenceState(job, { now: T0 + 5 * HOUR });
    expect(st.complete).toBe(true);
  });

  it("an existing agency case number counts as step 1 done", () => {
    const job = {
      ...seqJob(),
      paperwork: { coned: { meterApplication: { value: "new_meter" }, caseNumber: "MC-1" } },
    };
    const st = newAccountSequenceState(job, { now: T0 });
    expect(st.steps[0].phase).toBe("done");
    expect(st.currentIndex).toBe(1);
  });

  it("final checklist is a flagged stub that creates an Israel task", () => {
    const step = NEW_ACCOUNT_STEPS.find((s) => s.id === "final_checklist");
    expect(step.stub).toBe(true);
    const p = buildSequenceStepPayload(seqJob(), step);
    expect(p.stub).toBe(true);
    expect(p.note).toMatch(/no skill built/i);
  });
});
