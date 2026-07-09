// Job-info awareness bubbles — sell, billing, paperwork (hide when complete).
import { hasPendingInvoiceReview } from "./invoiceAgentDraft.js";
import { jobCalendarLinkState } from "./calendarLink.js";
import { followUpDate, PAPERWORK_REMINDER_DAYS } from "./calendarDue.js";
import { todayStr } from "./format.js";
import {
  DATE_STEPS,
  INSPECTION_STEPS,
  PAPER,
  PAPERWORK_PILL_STYLES,
  formatPaperDate,
  isDatedStep,
  paperworkTiming,
  paperworkUpNext,
  STEP_SHORT,
} from "./paperwork.js";
import { isCleared, stepState } from "./stages.js";

/** Customer/job needs attention on the Jobs tab. */
export function needsAttentionJob(job, today = todayStr()) {
  if (job.paid || job._archived || job._deleted) return false;
  const fu = followUpDate(job);
  if (fu && fu <= today) return true;
  if (job.invoiceNo && !job.paid) return true;
  if (!isCleared(job, "Estimate") || !isCleared(job, "Invoiced")) return true;
  const pw = job.paperwork || {};
  for (const k of Object.keys(PAPER)) {
    const br = pw[k];
    if (br?.enabled && paperworkUpNext(k, br)?.step) return true;
  }
  return false;
}

function paperworkNudgeOverdue(job, today = todayStr()) {
  const fu = job.followUp || {};
  if (fu.type !== "Paperwork / permits" || !fu.date) return false;
  return fu.date <= today;
}

function stageBubbleTone(job, stage) {
  if (job._freshBubble === stage) return "green";
  const entered = (job.status || {})[stage]?.d || "";
  if (!entered) return "purple";
  const nudgeDay = addDaysStr(entered, PAPERWORK_REMINDER_DAYS);
  if (nudgeDay <= todayStr()) return "red";
  return "purple";
}

function paperworkBubbleTone(job, line, cal, today = todayStr()) {
  if (job._freshBubble === line.branchKey) return "green";
  if (paperworkNudgeOverdue(job, today)) return "red";
  const { step, hasDate, isInspection } = line;
  if (isInspection || line.isSchedulable) {
    if (cal.confirmed) return "green";
    if (cal.pending) return "orange";
    return "red";
  }
  if (hasDate && cal.confirmed) return "green";
  if (hasDate && cal.pending) return "orange";
  if (!step) return "slate";
  const br = (job.paperwork || {})[line.branchKey] || {};
  const since = br.stepSince?.[step] || "";
  if (since && addDaysStr(since, PAPERWORK_REMINDER_DAYS) <= today) return "red";
  return "purple";
}

function addDaysStr(dateStr, days) {
  const d = new Date(String(dateStr).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** All actionable bubbles for the job-info card (completed branches hidden). */
export function jobAwarenessBubbles(job, events, commands) {
  const bubbles = [];
  const cal = jobCalendarLinkState(job, events, commands);

  if (!isCleared(job, "Estimate")) {
    const hasEst = !!(job.estimateNo || job._estimateConfirmed);
    bubbles.push({
      key: "stage-estimate",
      kind: "stage",
      stage: "Estimate",
      branchLabel: "Sell",
      upNext: hasEst ? `Estimate #${job.estimateNo}` : "Create estimate",
      timing: "Up next",
      tone: stageBubbleTone(job, "Estimate"),
      isSchedulable: false,
      action: hasEst ? "open-estimate" : "create-estimate",
    });
  }

  if (!isCleared(job, "Invoiced")) {
    const hasInv = !!(job.invoiceNo || job._invoiceConfirmed);
    const review = hasPendingInvoiceReview(job);
    bubbles.push({
      key: "stage-invoiced",
      kind: "stage",
      stage: "Invoiced",
      branchLabel: "Billing",
      upNext: review ? "Review agent edits" : hasInv ? `Invoice #${job.invoiceNo}` : "Create invoice",
      timing: review ? "Review" : "Up next",
      tone: review ? "agentReview" : stageBubbleTone(job, "Invoiced"),
      isSchedulable: false,
      action: hasInv || review ? "open-invoice" : "create-invoice",
    });
  } else if (!isCleared(job, "Deposit Receipt") && stepState(job, "Invoiced") === "done") {
    bubbles.push({
      key: "stage-deposit",
      kind: "stage",
      stage: "Deposit Receipt",
      branchLabel: "Billing",
      upNext: "Record deposit",
      timing: "Up next",
      tone: stageBubbleTone(job, "Deposit Receipt"),
      isSchedulable: false,
      action: "record-deposit",
    });
  }

  const pw = job.paperwork || {};
  for (const k of Object.keys(PAPER)) {
    const br = pw[k];
    if (!br?.enabled) continue;
    const next = paperworkUpNext(k, br);
    if (!next?.step) continue;
    const step = next.step;
    const hasDate = !!next.date;
    const isInspection = INSPECTION_STEPS.has(step);
    const line = {
      branchKey: k,
      branchLabel: PAPER[k].short || PAPER[k].nm,
      upNext: next.label,
      timing: paperworkTiming(next),
      step,
      hasDate,
      isInspection,
      date: next.date || "",
      isSchedulable: isInspection,
      kind: "paperwork",
    };
    line.tone = paperworkBubbleTone(job, line, cal);
    bubbles.push({ key: "paper-" + k, ...line });
  }

  return bubbles;
}

export function bubbleStyle(tone) {
  if (tone === "agentReview") return "bg-red-50 text-red-700 border-red-300 animate-pulse";
  return PAPERWORK_PILL_STYLES[tone] || PAPERWORK_PILL_STYLES.slate;
}

export function bubbleStepMeta(bubble) {
  if (bubble.kind === "paperwork") {
    return {
      needsDate: isDatedStep(bubble.step),
      isInspection: INSPECTION_STEPS.has(bubble.step),
      stepLabel: bubble.step,
      shortLabel: STEP_SHORT[bubble.step] || bubble.step,
      dateKind: DATE_STEPS[bubble.step] || "date",
    };
  }
  return { needsDate: false, isInspection: false, stepLabel: bubble.stage, shortLabel: bubble.upNext };
}

export function formatBubbleDate(raw, kind) {
  return formatPaperDate(raw, kind);
}