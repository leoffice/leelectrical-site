// Paperwork branches — sub-step lists copied EXACTLY from app/sleek.html.
export const PAPER = {
  coned: {
    nm: "Con Edison",
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
    nm: "DOB / City Permit",
    steps: [
      "Application submitted",
      "Permit issued",
      "Inspection requested",
      "Inspection scheduled",
      "Self certification",
      "PAA complete",
    ],
  },
};

/** Steps matching this get a date input next to their toggle (as in sleek). */
export const isDatedStep = (s) => /date|scheduled/i.test(s);
