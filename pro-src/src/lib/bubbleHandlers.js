import { followUpFromPaperworkStep } from "./calendarDue.js";
import { todayStr } from "./format.js";
import { INSPECTION_STEPS, PAPER, isDatedStep, paperworkUpNext, stepDoneLabel } from "./paperwork.js";
import { isCleared } from "./stages.js";

export function bubbleCompleteLabel(bubble) {
  if (bubble.kind === "paperwork") return stepDoneLabel(bubble.step, "Mark step done");
  if (bubble.stage === "Deposit Receipt") return "Deposit recorded";
  if (bubble.stage === "Estimate") return "Estimate complete";
  if (bubble.stage === "Invoiced") return "Invoice complete";
  return "Mark step done";
}

export function calendarPromptAfterComplete(job, bubble) {
  if (bubble.kind !== "paperwork") return null;
  const k = bubble.branchKey;
  const s = bubble.step;
  const br = (job.paperwork || {})[k] || {};
  const after = {
    ...br,
    enabled: true,
    steps: { ...(br.steps || {}), [s]: true },
    active: { ...(br.active || {}), [s]: true },
  };
  const next = paperworkUpNext(k, after);
  if (!next?.step) return null;
  if (INSPECTION_STEPS.has(next.step) || isDatedStep(next.step)) {
    return { branchKey: k, step: next.step, initialDt: next.date || "" };
  }
  return null;
}

export function completeAwarenessBubble(jobId, job, bubble, patchJob) {
  if (bubble.kind === "stage") {
    const p = { status: { [bubble.stage]: { s: "done", d: todayStr() } }, _freshBubble: bubble.stage };
    if (bubble.stage === "Paid") p.paid = true;
    patchJob(jobId, p);
    return null;
  }
  const k = bubble.branchKey;
  const s = bubble.step;
  const br = (job.paperwork || {})[k] || {};
  const after = {
    ...br,
    enabled: true,
    steps: { ...(br.steps || {}), [s]: true },
    active: { ...(br.active || {}), [s]: true },
  };
  const next = paperworkUpNext(k, after);
  patchJob(jobId, {
    paperwork: {
      [k]: {
        steps: { [s]: true },
        active: { [s]: true },
        ...(next?.step ? { stepSince: { [next.step]: todayStr() } } : {}),
      },
    },
    followUp: followUpFromPaperworkStep(k, s),
    _freshBubble: k,
  });
  return calendarPromptAfterComplete(
    {
      ...job,
      paperwork: {
        ...(job.paperwork || {}),
        [k]: after,
      },
    },
    bubble
  );
}

export function revertAwarenessBubble(jobId, job, bubble, patchJob) {
  if (bubble.kind === "stage") {
    patchJob(jobId, { status: { [bubble.stage]: { s: "" } } });
    return;
  }
  const k = bubble.branchKey;
  const s = bubble.step;
  const br = (job.paperwork || {})[k] || {};
  const steps = Object.keys(br.steps || {}).filter((x) => x !== s);
  const prevStep = steps.length ? steps[steps.length - 1] : null;
  const patch = {
    paperwork: {
      [k]: {
        steps: { [s]: false },
        active: { [s]: false },
      },
    },
  };
  if (prevStep) {
    patch.paperwork[k].steps[prevStep] = false;
    patch._freshBubble = k;
  }
  patchJob(jobId, patch);
}

export function skipAwarenessBubble(jobId, bubble, patchJob) {
  if (bubble.kind === "stage") {
    patchJob(jobId, { status: { [bubble.stage]: { s: "skipped", d: todayStr() } } });
    return;
  }
  patchJob(jobId, { paperwork: { [bubble.branchKey]: { removed: { [bubble.step]: true } } } });
}

export function tapAwarenessBubble(job, bubble, setSheet, openDocTabFn) {
  if (bubble.action === "create-estimate") {
    setSheet({ kind: "docBuild", docKind: "estimate", mode: "create" });
    return;
  }
  if (bubble.action === "create-invoice") {
    setSheet({ kind: "invoiceCreate" });
    return;
  }
  if (bubble.action === "open-estimate") {
    openDocTabFn(job, "estimate", setSheet);
    return;
  }
  if (bubble.action === "open-invoice") {
    openDocTabFn(job, "invoice", setSheet);
    return;
  }
  if (bubble.action === "record-deposit") {
    setSheet({ kind: "paymenu" });
    return;
  }
  setSheet({ kind: "bubble", bubble });
}

/** When an estimate/invoice exists but its stage is not cleared, nudge the stage bubble. */
export function ensureDocStageBubbles(job) {
  const patch = { status: {} };
  if (job.estimateNo && !isCleared(job, "Estimate")) {
    patch.status.Estimate = { s: "done", d: todayStr() };
  }
  if (job.invoiceNo && !isCleared(job, "Invoiced")) {
    patch.status.Invoiced = { s: "done", d: todayStr() };
  }
  return Object.keys(patch.status).length ? patch : null;
}