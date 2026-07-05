// Stage/phase model — names MUST match the existing dashboard exactly.
// job.status = { "Lead": { s: "done"|"skipped"|""|"current", d?: "YYYY-MM-DD" }, ... }
import { parseAmount, todayStr } from "./format.js";

export const STAGES = [
  "Lead",
  "Site Visit",
  "Estimate",
  "Accepted",
  "Invoiced",
  "Deposit Receipt",
  "Paperwork",
  "Scheduled",
  "Done",
  "Follow-up",
  "Paid",
];

export const PHASES = [
  { nm: "Sales", ic: "🤝", steps: ["Lead", "Site Visit", "Estimate", "Accepted"] },
  { nm: "Billing", ic: "🧾", steps: ["Invoiced", "Deposit Receipt"] },
  { nm: "Paperwork", ic: "📑", steps: ["Paperwork"] },
  { nm: "Job", ic: "⚡", steps: ["Scheduled", "Done"] },
  { nm: "Wrap-up", ic: "✅", steps: ["Follow-up", "Paid"] },
];

export const FOLLOWUP_TYPES = [
  "Acceptance",
  "Payment / collect",
  "Schedule the job",
  "Paperwork / permits",
  "Con Edison case",
  "Final inspection",
  "Other",
];

export function stepState(job, stage) {
  const st = (job.status || {})[stage];
  return (st && st.s) || "";
}

export function isCleared(job, stage) {
  const s = stepState(job, stage);
  return s === "done" || s === "skipped";
}

/** First stage that isn't done/skipped. Matches sleek's stageOf() —
 *  returns "Paid" when everything is cleared. */
export function stageOf(job) {
  for (const st of STAGES) if (!isCleared(job, st)) return st;
  return "Paid";
}

/** Same walk but null when fully complete (handy for a couple of UI bits). */
export function currentStage(job) {
  for (const st of STAGES) if (!isCleared(job, st)) return st;
  return null;
}

export function progressPct(job) {
  const n = STAGES.filter((st) => isCleared(job, st)).length;
  return Math.round((n / STAGES.length) * 100);
}

export function phaseOfStage(stage) {
  return PHASES.find((p) => p.steps.includes(stage)) || null;
}

export function isPaid(job) {
  return !!job.paid;
}

export function isInvoiced(job) {
  return !!job.invoiceNo;
}

/** One-line "what's next" — matches sleek's nextAction(). */
export function nextAction(job) {
  const st = stageOf(job);
  const t = todayStr();
  if (st === "Follow-up" && job.followUp && job.followUp.date && job.followUp.date <= t)
    return "Follow-up due" + (job.followUp.date < t ? " (overdue)" : " today");
  if (st === "Paid" && !job.paid) return "Collect payment";
  return "Next: " + st;
}

/** Filter chips — logic copied from sleek's chipTest(). */
const FILTERS = {
  Active: (j) => !j.paid,
  Leads: (j) => ["Lead", "Site Visit"].includes(stageOf(j)),
  Estimates: (j) => ["Estimate", "Accepted"].includes(stageOf(j)),
  Scheduled: (j) =>
    stageOf(j) === "Scheduled" ||
    !!(j.status && j.status.Scheduled && j.status.Scheduled.s === "done" && stageOf(j) !== "Paid" && !j.paid),
  Unpaid: (j) => !j.paid && !!j.invoiceNo,
  Paid: (j) => !!j.paid,
  All: () => true,
};

export const FILTER_NAMES = Object.keys(FILTERS);

export function matchesFilter(job, name) {
  return (FILTERS[name] || FILTERS.All)(job);
}

export function matchesQuery(job, q) {
  if (!q) return true;
  const hay = [job.customer, job.title, job.address, job.invoiceNo, job.estimateNo, job.notes, job.id]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

/** Grouping key — clientGroup, else normalized customer name (bug #1 fix).
 *  Lives in customers.js; re-exported here for existing imports. */
export { clientKey, normalizeCustomer } from "./customers.js";

/** Sort like sleek: biggest amount first. */
export function sortJobs(list) {
  return list.slice().sort((a, b) => parseAmount(b.amount) - parseAmount(a.amount));
}

export { todayStr };
