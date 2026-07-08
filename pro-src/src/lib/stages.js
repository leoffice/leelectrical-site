// Stage/phase model — names MUST match the existing dashboard exactly.
// job.status = { "Lead": { s: "done"|"skipped"|""|"current", d?: "YYYY-MM-DD" }, ... }
import { parseAmount, todayStr } from "./format.js";
import { openBalance } from "./customers.js";
import { isToDoJob, isUpcomingJob } from "./calendarDue.js";
import { needsAttentionJob } from "./jobAwareness.js";

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
  "Needs attention": (j) => needsAttentionJob(j),
  "To Do": (j) => isToDoJob(j),
  Upcoming: (j) => isUpcomingJob(j),
  Leads: (j) => ["Lead", "Site Visit"].includes(stageOf(j)),
  Estimates: (j) => ["Estimate", "Accepted"].includes(stageOf(j)),
  Scheduled: (j) =>
    stageOf(j) === "Scheduled" ||
    !!(j.status && j.status.Scheduled && j.status.Scheduled.s === "done" && stageOf(j) !== "Paid" && !j.paid),
  Unpaid: (j) => !j.paid && !!j.invoiceNo,
  Paid: (j) => !!j.paid,
  All: () => true,
};

export const FILTER_NAMES = [
  "Active",
  "Needs attention",
  "To Do",
  "Upcoming",
  "Leads",
  "Estimates",
  "Scheduled",
  "Unpaid",
  "Paid",
  "All",
];

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

/* ---------- Jobs sort-by ---------- */

const byAmountDesc = (a, b) => openBalance(b) - openBalance(a);

const followUpDate = (j) => (j.followUp && j.followUp.date) || "";
const scheduledDate = (j) => (j.status && j.status.Scheduled && j.status.Scheduled.d) || "";
const invoicedDate = (j) => (j.status && j.status.Invoiced && j.status.Invoiced.d) || "";

/** Earliest of the Scheduled job-date and the follow-up date ("" if neither). */
export function nextStepDate(j) {
  const ds = [scheduledDate(j), followUpDate(j)].filter(Boolean);
  return ds.length ? ds.sort()[0] : "";
}

/** Overdue = unpaid job whose follow-up date is in the past. */
export function isOverdue(j, today) {
  const d = followUpDate(j);
  return !j.paid && !!d && d < (today || todayStr());
}

/** Best-effort "created" rank — createdAt, else local-<ts> id, else Lead date. */
function newness(j) {
  if (j.createdAt) return j.createdAt;
  const m = /^local-(\d+)$/.exec(String(j.id || ""));
  if (m) return Number(m[1]);
  const lead = j.status && j.status.Lead && j.status.Lead.d;
  const t = lead ? Date.parse(lead) : NaN;
  return isNaN(t) ? 0 : t;
}

/** Dated first (ascending), undated last; amount desc breaks ties. */
const dateAsc = (get) => (a, b) => {
  const da = get(a);
  const db = get(b);
  if (da && db) return da < db ? -1 : da > db ? 1 : byAmountDesc(a, b);
  if (da || db) return da ? -1 : 1;
  return byAmountDesc(a, b);
};

const SORT_CMPS = {
  smart: (a, b) =>
    (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0) || byAmountDesc(a, b),
  amount: byAmountDesc,
  next: dateAsc(nextStepDate),
  priority: (a, b) => {
    // Tier 0: unpaid invoices (oldest invoice = most overdue). Tier 1: other
    // unpaid work. Tier 2: paid. Amount desc inside a tier.
    const tier = (x) => (!x.paid && x.invoiceNo ? 0 : !x.paid ? 1 : 2);
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return dateAsc(invoicedDate)(a, b);
    return byAmountDesc(a, b);
  },
  followup: dateAsc(followUpDate),
  newest: (a, b) => newness(b) - newness(a) || byAmountDesc(a, b),
};

/** Dropdown options for the Jobs view (order = display order). */
export const SORT_OPTIONS = [
  { key: "smart", label: "Smart (overdue → amount)" },
  { key: "amount", label: "Amount" },
  { key: "next", label: "Next step date" },
  { key: "priority", label: "Priority (overdue invoices)" },
  { key: "followup", label: "Follow-up due" },
  { key: "newest", label: "Newest" },
];

/** Comparator for a sort key (unknown keys fall back to amount = sleek's sort). */
export function sortCmp(key) {
  return SORT_CMPS[key] || SORT_CMPS.amount;
}

/** Sort like sleek by default (biggest amount first); pass a key for others. */
export function sortJobs(list, key) {
  return list.slice().sort(sortCmp(key));
}

/** To Do / Upcoming tabs — earliest next action first (overdue → soonest). */
export function sortByNextAction(list) {
  return list.slice().sort(dateAsc(nextStepDate));
}

export { todayStr };
