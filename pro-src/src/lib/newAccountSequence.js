// newAccountSequence — the stepwise new-account application (Levi 2026-08-13):
//   submit application → account activated → order inspection → final checklist
// Each step is its OWN confirmed deploy: the next button unlocks only after the
// prior step is CONFIRMED performed (agent/email notification — never a
// self-report). Rides the universal permitConfirm records with keys
// `newacct:<jobId>:<stepId>`.
//
// LEVI-DEFAULTS baked in (configurable / flagged for refinement):
//   #2 "account activated" — no auto signal defined yet → Israel/agent
//      manual-confirm (a Mark-activated button that stamps an agent confirm).
//   #3 "final checklist" — no skill exists → Deploy creates an Israel task on
//      the bus (stub cmd) and the step completes only on confirmation.

import {
  buildActionConfirmedPatch,
  buildActionFiredPatch,
  getPermitAction,
  permitActionPhase,
} from "./permitConfirm.js";

export const NEW_ACCOUNT_STEPS = [
  {
    id: "submit_application",
    title: "Submit application",
    what: "Submit the new-account application at Con Ed Energy Services (Form A / create case).",
    cmd: "coned_upload_document",
    manualConfirm: false,
  },
  {
    id: "account_activated",
    title: "Account activated",
    what: "Ensure the Con Ed account is ACTIVATED (not just filed).",
    cmd: "",
    manualConfirm: true,
    note: "Default: Israel/agent confirms manually until an auto signal is defined.",
  },
  {
    id: "order_inspection",
    title: "Order inspection",
    what: "Order the inspection on the activated account.",
    cmd: "coned_inspection_request",
    manualConfirm: false,
  },
  {
    id: "final_checklist",
    title: "Final checklist",
    what: "Submit the final checklist at Con Ed. On confirmation the sequence completes.",
    cmd: "coned_final_checklist",
    manualConfirm: false,
    stub: true,
    note: "No final-checklist skill yet — Deploy creates an Israel task; done on confirmation.",
  },
];

export function sequenceActionKey(jobId, stepId) {
  return `newacct:${jobId}:${stepId}`;
}

/** Does this job run the new-account sequence? (new meter / new application) */
export function jobHasNewAccountSequence(job) {
  const v = String(job?.paperwork?.coned?.meterApplication?.value || "");
  return v === "new_meter" || v === "new_application";
}

/**
 * Derive the live sequence: each step gets
 *   { ...step, phase: 'done'|'sent'|'flagged'|'ready'|'locked', rec }
 * plus which index is current. Step 0 also counts as done when the job already
 * carries a real case number (the application exists at the agency).
 */
export function newAccountSequenceState(job, { now = Date.now(), config } = {}) {
  const jobId = job?.id || "";
  let unlocked = true;
  let currentIndex = -1;
  const steps = NEW_ACCOUNT_STEPS.map((step, i) => {
    const rec = getPermitAction(job, sequenceActionKey(jobId, step.id));
    let phase = permitActionPhase(rec, { now, config });
    if (phase === "confirmed") phase = "done";
    // Application already on file at the agency counts as step-0 done.
    if (
      i === 0 &&
      phase !== "done" &&
      String(job?.paperwork?.coned?.caseNumber || "").trim() &&
      !rec
    ) {
      phase = "done";
    }
    if (phase !== "done" && !unlocked) phase = "locked";
    if (phase !== "done" && unlocked && currentIndex === -1) currentIndex = i;
    if (phase !== "done") unlocked = false;
    return { ...step, phase, rec: rec || null };
  });
  const complete = steps.every((s) => s.phase === "done");
  return { steps, currentIndex: complete ? steps.length - 1 : currentIndex, complete };
}

/** Fire one step (stamps sent; the bus enqueue happens at the call site). */
export function buildSequenceStepFiredPatch(job, stepId, { now } = {}) {
  const step = NEW_ACCOUNT_STEPS.find((s) => s.id === stepId);
  return buildActionFiredPatch(job, sequenceActionKey(job?.id, stepId), {
    kind: `newacct:${stepId}`,
    via: step?.cmd ? `bus:${step.cmd}` : "manual",
    now,
  });
}

/** Confirm one step performed (agent/email/manual notification). */
export function buildSequenceStepConfirmedPatch(job, stepId, { by = "agent", source = "", now } = {}) {
  return buildActionConfirmedPatch(job, sequenceActionKey(job?.id, stepId), {
    by,
    source,
    now,
  });
}

/** Bus payload for a fired step. */
export function buildSequenceStepPayload(job, step) {
  return {
    kind: `new_account_${step.id}`,
    skill: step.cmd || "",
    stub: step.stub === true,
    jobId: job?.id || "",
    caseNumber: String(job?.paperwork?.coned?.caseNumber || "").trim(),
    customer: job?.customer || job?.personName || "",
    address: job?.serviceAddress || job?.address || "",
    note: step.stub
      ? "STUB: no skill built — this is an Israel task; confirm when performed."
      : "",
    stopAt: "review",
    autoSubmit: false,
  };
}
