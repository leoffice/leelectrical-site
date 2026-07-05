// Stage/phase model — names MUST match the existing dashboard exactly.
// job.status = { "Lead": { s: "done"|"skipped"|"current"|"upcoming"|"", d?: "YYYY-MM-DD" }, ... }

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

export function stepState(job, stage) {
  const st = (job.status || {})[stage];
  return (st && st.s) || "";
}

export function isCleared(job, stage) {
  const s = stepState(job, stage);
  return s === "done" || s === "skipped";
}

/** First stage that isn't done/skipped — where the job currently stands. */
export function currentStage(job) {
  for (const st of STAGES) if (!isCleared(job, st)) return st;
  return null; // everything cleared -> fully complete
}

export function progressPct(job) {
  const n = STAGES.filter((st) => isCleared(job, st)).length;
  return Math.round((n / STAGES.length) * 100);
}

export function phaseOfStage(stage) {
  return PHASES.find((p) => p.steps.includes(stage)) || null;
}

export function isPaid(job) {
  return !!job.paid || stepState(job, "Paid") === "done";
}

export function isInvoiced(job) {
  return stepState(job, "Invoiced") === "done" || !!job.invoiceNo;
}

/** One-line "what's next" for the card. */
export function nextAction(job) {
  if (job.followUp && (job.followUp.text || job.followUp.date)) {
    const d = job.followUp.date ? ` · ${job.followUp.date}` : "";
    return `${job.followUp.text || job.followUp.type || "Follow up"}${d}`;
  }
  const cur = currentStage(job);
  if (!cur) return "All wrapped up 🎉";
  const hints = {
    Lead: "Qualify the lead",
    "Site Visit": "Schedule the site visit",
    Estimate: "Send the estimate",
    Accepted: "Get acceptance",
    Invoiced: "Send the invoice",
    "Deposit Receipt": "Collect the deposit",
    Paperwork: "File permits / Con Edison",
    Scheduled: "Schedule the job",
    Done: "Do the work",
    "Follow-up": "Follow up with the customer",
    Paid: "Collect payment",
  };
  return hints[cur] || cur;
}

const FILTERS = {
  Active: (j) => !isPaid(j) && currentStage(j) !== null,
  Leads: (j) => ["Lead", "Site Visit"].includes(currentStage(j)),
  Estimates: (j) => ["Estimate", "Accepted"].includes(currentStage(j)),
  Scheduled: (j) =>
    currentStage(j) === "Scheduled" || stepState(j, "Scheduled") === "current",
  Unpaid: (j) => isInvoiced(j) && !isPaid(j),
  Paid: (j) => isPaid(j),
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

/** Grouping key: explicit clientGroup wins, else normalized customer name. */
export function clientKey(job) {
  if (job.clientGroup) return "g:" + job.clientGroup;
  return "c:" + (job.customer || "").trim().toLowerCase();
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
