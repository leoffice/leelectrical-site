import { jobCalendarLinkState } from "./calendarLink.js";

// Paperwork branches — sub-step lists copied EXACTLY from app/jobs.html
// (the authoritative old dashboard; app/jobs-beta.html is identical).
// NOTE: sleek.html's DOB list wrongly added "Application submitted" — the old
// dashboard's DOB_STEPS has 5 steps and that is what saved jobs expect.
// Branch keys `coned` / `dob` are the saved-data keys in state.ov[job].paperwork
// and MUST NOT change. (Some old jobs also carry a legacy `permit` branch —
// jobs.html ignores it and so do we; deep-merge saves keep it intact.)
export const PAPER = {
  coned: {
    nm: "🔌 Con Ed paperwork",
    short: "ConEd",
    steps: [
      "Application submitted",
      "POE scheduled",
      "Uploaded paperwork complete",
      "New accounts activated",
      "Interim checklist",
      "Final checklist",
      "Inspection appointment",
      "Meter installation date",
    ],
  },
  dob: {
    nm: "🏙️ DOB / City permit",
    short: "DOB",
    steps: [
      "Permit issued",
      "Inspection requested",
      "Inspection scheduled",
      "Self certification",
      "PAA complete",
    ],
  },
};

/** Past-tense label for the bubble "mark done" action. */
export const STEP_DONE_LABEL = {
  "Application submitted": "Application submitted",
  "POE scheduled": "POE scheduled",
  "Uploaded paperwork complete": "Paperwork uploaded",
  "New accounts activated": "Accounts activated",
  "Interim checklist": "Interim checklist complete",
  "Final checklist": "Final checklist complete",
  "Inspection appointment": "Inspection scheduled",
  "Meter installation date": "Meter date set",
  "Permit issued": "Permit issued",
  "Inspection requested": "Inspection requested",
  "Inspection scheduled": "Inspection scheduled",
  "Self certification": "Self certification complete",
  "PAA complete": "PAA complete",
};

export function stepDoneLabel(step, fallback = "Mark step done") {
  if (!step) return fallback;
  return STEP_DONE_LABEL[step] || fallback;
}

/** Shorter labels for the job-info "Up next" line. */
export const STEP_SHORT = {
  "Application submitted": "Submit application",
  "POE scheduled": "Schedule POE",
  "Uploaded paperwork complete": "Upload paperwork",
  "New accounts activated": "Activate the new account",
  "Interim checklist": "Complete interim checklist",
  "Final checklist": "Complete final checklist",
  "Inspection appointment": "Schedule inspection appointment",
  "Meter installation date": "Set meter installation date",
  "Permit issued": "Obtain permit",
  "Inspection requested": "Request inspection",
  "Inspection scheduled": "Schedule inspection",
  "Self certification": "Self certification",
  "PAA complete": "Complete PAA",
};

/** Per-step date fields — jobs.html DATE_STEPS + Con Ed inspection appointment. */
export const DATE_STEPS = {
  "Inspection scheduled": "datetime",
  "Inspection appointment": "datetime",
  "Meter installation date": "date",
};

/** Steps in DATE_STEPS get a date input next to their toggle. */
export const isDatedStep = (s) => !!DATE_STEPS[s];

/** Steps that open the inspection sheet (datetime + calendar + customer email). */
export const INSPECTION_STEPS = new Set(["Inspection scheduled", "Inspection appointment"]);

export function visiblePaperSteps(branchKey, br = {}) {
  return (PAPER[branchKey]?.steps || []).filter((ps) => !(br.removed && br.removed[ps]));
}

export function firstVisiblePaperStep(branchKey, br = {}) {
  return visiblePaperSteps(branchKey, br)[0] || "";
}

/** Format a stored date/datetime for display in Up next. */
export function formatPaperDate(raw, kind = "date") {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (kind === "datetime" && s.includes("T")) {
    const [d, t] = s.split("T");
    const [y, m, day] = d.split("-");
    const [hh, mm] = (t || "").split(":");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = months[Number(m) - 1] || m;
    const hour = Number(hh);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${mon} ${Number(day)}, ${h12}:${mm || "00"} ${ampm}`;
  }
  const [y, m, day] = s.slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1] || m} ${Number(day)}, ${y}`;
}

/** Next incomplete paperwork step for a branch (with optional scheduled date). */
export function paperworkUpNext(branchKey, br = {}) {
  if (!br?.enabled) return null;
  const visible = visiblePaperSteps(branchKey, br);
  for (const ps of visible) {
    if (br.steps && br.steps[ps]) continue;
    const date = br.dates && br.dates[ps];
    const kind = DATE_STEPS[ps] || "date";
    if (date && /inspection/i.test(ps)) {
      return { step: ps, label: `Inspection on ${formatPaperDate(date, kind)}`, date };
    }
    if (date) {
      return {
        step: ps,
        label: `${STEP_SHORT[ps] || ps} — ${formatPaperDate(date, kind)}`,
        date,
      };
    }
    return { step: ps, label: STEP_SHORT[ps] || ps, date: "" };
  }
  return { step: null, label: "All steps complete", date: "" };
}

/** "Up next" vs "Current" for paperwork bubble labels. */
export function paperworkTiming(next) {
  if (!next?.step) return "Current";
  const d = next.date ? String(next.date).slice(0, 10) : "";
  if (!d) return "Up next";
  const today = new Date().toISOString().slice(0, 10);
  return d <= today ? "Current" : "Up next";
}

/** Default calendar title when creating an inspection appointment from paperwork. */
export function inspectionAppointmentTitle(step, dateRaw = "") {
  const base = step === "Inspection appointment" ? "Con Edison appointment" : "Inspection appointment";
  if (!dateRaw) return base;
  const when = formatPaperDate(dateRaw, DATE_STEPS[step] || "datetime");
  return when ? `${base} — ${when}` : base;
}

/** Pill color: green = confirmed on calendar; orange = queued/syncing; red = needs appointment. */
export function paperworkPillTone({ step, hasDate, isInspection, calendarConfirmed, calendarPending }) {
  if (!step) return "slate";
  if (hasDate && isInspection) {
    if (calendarConfirmed) return "green";
    if (calendarPending) return "orange";
    return "red";
  }
  if (hasDate && calendarConfirmed) return "green";
  if (hasDate && calendarPending) return "orange";
  return "purple";
}

export const PAPERWORK_PILL_STYLES = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  orange: "border-orange-200 bg-orange-50 text-orange-900",
  red: "border-red-200 bg-red-50 text-red-900",
  purple: "border-violet-200 bg-violet-50 text-violet-900",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

/** Job-info awareness lines — one per enabled branch. */
export function paperworkAwarenessLines(job, events, commands) {
  const pw = job?.paperwork || {};
  const cal = jobCalendarLinkState(job, events, commands);
  const lines = [];
  for (const k of Object.keys(PAPER)) {
    const br = pw[k];
    if (!br?.enabled) continue;
    const next = paperworkUpNext(k, br);
    const step = next?.step || null;
    const hasDate = !!next?.date;
    const isInspection = step ? INSPECTION_STEPS.has(step) : false;
    const isSchedulable = isInspection;
    const tone = paperworkPillTone({
      step,
      hasDate,
      isInspection,
      calendarConfirmed: cal.confirmed,
      calendarPending: cal.pending,
    });
    lines.push({
      branchKey: k,
      branchLabel: PAPER[k].short || PAPER[k].nm,
      upNext: next?.label || "—",
      timing: paperworkTiming(next),
      step,
      hasDate,
      isInspection,
      isSchedulable,
      calendarLinked: cal.confirmed,
      calendarPending: cal.pending,
      tone,
      date: next?.date || "",
    });
  }
  return lines;
}

export function hasActivePaperwork(job) {
  return paperworkAwarenessLines(job).length > 0;
}