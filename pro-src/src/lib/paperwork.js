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
    steps: [
      "Application submitted",
      "POE scheduled",
      "Uploaded paperwork complete",
      "New accounts activated",
      "Interim checklist",
      "Final checklist",
      "Meter installation date",
    ],
  },
  dob: {
    nm: "🏙️ DOB / City permit",
    steps: [
      "Permit issued",
      "Inspection requested",
      "Inspection scheduled",
      "Self certification",
      "PAA complete",
    ],
  },
};

/** Per-step date fields — jobs.html's DATE_STEPS, exactly. Only these two
 *  sub-steps carry a date; "POE scheduled" etc. do NOT (sleek got that wrong). */
export const DATE_STEPS = {
  "Inspection scheduled": "datetime",
  "Meter installation date": "date",
};

/** Steps in DATE_STEPS get a date input next to their toggle. */
export const isDatedStep = (s) => !!DATE_STEPS[s];
