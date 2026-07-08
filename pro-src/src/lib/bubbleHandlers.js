import { followUpFromPaperworkStep } from "./calendarDue.js";
import { todayStr } from "./format.js";
import { paperworkUpNext } from "./paperwork.js";

export function completeAwarenessBubble(jobId, job, bubble, patchJob) {
  if (bubble.kind === "stage") {
    const p = { status: { [bubble.stage]: { s: "done", d: todayStr() } }, _freshBubble: bubble.stage };
    if (bubble.stage === "Paid") p.paid = true;
    patchJob(jobId, p);
    return;
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
  setSheet({ kind: "bubble", bubble });
}