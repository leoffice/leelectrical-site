// Energy Services / Con Edison email → job insight (shared server + app logic).

function normalizeAddress(raw) {
  const abbrevs = {
    street: "st",
    avenue: "ave",
    road: "rd",
    boulevard: "blvd",
    drive: "dr",
    lane: "ln",
    court: "ct",
    place: "pl",
  };
  let s = String(raw || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [full, short] of Object.entries(abbrevs)) {
    s = s.replace(new RegExp("\\b" + full + "\\b", "g"), short);
  }
  return s;
}

function addressSimilarity(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((w) => w.length > 1));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

/** Light title-case for DOB all-caps street / borough tokens. */
function titleCaseStreet(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Ny|Nyc)\b/g, (m) => m.toUpperCase());
}

/** DOB job number e.g. M01228312 or B01334914I1EL / M01228312/I1 */
export function extractDobJobNumber(text) {
  const s = stripHtml(text);
  const m =
    s.match(/\bjob\s*number\s*[:#]?\s*([A-Z]?\d{6,12}(?:\s*\/\s*I\d+)?[A-Z0-9]*)/i) ||
    s.match(/\bjob\s*number\s+([A-Z]?\d{6,12}(?:\/I\d+)?[A-Z0-9]*)/i) ||
    s.match(/\b([A-Z]\d{8,12}(?:\/I\d+)?(?:EL)?)\b/);
  return m ? m[1].replace(/\s+/g, "").trim() : "";
}

/** Strip HTML tags / entities so Con Edison HTML mail is parseable as plain text. */
export function stripHtml(raw) {
  let s = String(raw || "");
  if (!/<[a-z!/?]/i.test(s)) return s.replace(/\s+/g, " ").trim();
  s = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z]+;/gi, " ");
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

const ENERGY_SENDER_RE =
  /energy\s*services|con\s*edison|coned|@coned\.com|@conedison\.com|@energy-services|cpms\.noreply/i;

/** NYC DOB / City electrical inspection mail (often lands under DOB label, not Inbox). */
const CITY_DOB_SENDER_RE =
  /buildings\.nyc\.gov|dobnow|@buildings\.nyc\.gov|department\s+of\s+buildings|nyc\s+dob|electrical\s+inspection\s+scheduled|dob\s*now/i;

const STREET_RE =
  /\d+\s+[\w\s.'-]+(?:\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place|pkwy|parkway)\b)[^,;\n]*/i;

const DATE_TIME_RE =
  /(?:on\s+)?(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)[\s,]+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

const DATE_ONLY_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/;

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

/** Strong match threshold for silent auto-apply to calendar. */
export const AUTO_APPLY_MIN_SCORE = 0.7;

/**
 * Test gate (Levi 2026-07-21): auto-apply only N calendar appointments per app open.
 * Set to Infinity (or a large number) when the test looks good and limits lift.
 */
export const EMAIL_INSIGHT_TEST_AUTO_APPLY_LIMIT = 1;

/** Calendar event length for email-driven appointments — 1 hour (Levi: keep the 1h slot). */
export const APPOINTMENT_DURATION_MINUTES = 60;

export function isEnergyServicesEmail(from, subject = "", body = "") {
  const blob = [from, subject, body].join(" ");
  return ENERGY_SENDER_RE.test(blob) || CITY_DOB_SENDER_RE.test(blob);
}

/** True when mail is from NYC DOB / City electrical (not Con Ed). */
export function isCityDobEmail(from, subject = "", body = "") {
  const blob = [from, subject, body].join(" ");
  return CITY_DOB_SENDER_RE.test(blob) && !ENERGY_SENDER_RE.test(from || "");
}

/** Agency for titles / notes: coned | city | other */
export function classifyAgency(from = "", subject = "", body = "") {
  if (isCityDobEmail(from, subject, body)) return "city";
  if (ENERGY_SENDER_RE.test([from, subject, body].join(" "))) return "coned";
  return "other";
}

export function extractAddress(text) {
  const plain = stripHtml(text);
  // DOB: "at 149,EAST 116 STREET,Manhattan,10029" or "at 149 EAST 116 STREET, Manhattan, 10029"
  const dobAt = plain.match(
    /\bat\s+(\d+)\s*,?\s*([A-Za-z0-9 .'-]+?)\s*,\s*([A-Za-z .]+?)\s*,\s*(\d{5})(?:-\d{4})?\b/i
  );
  if (dobAt) {
    const street = `${dobAt[1]} ${dobAt[2]}`.replace(/\s+/g, " ").replace(/\s*,\s*/g, " ").trim();
    const borough = dobAt[3].replace(/\s+/g, " ").trim();
    const zip = dobAt[4];
    if (street.length >= 6) {
      return `${titleCaseStreet(street)}, ${titleCaseStreet(borough)}, NY ${zip}`;
    }
  }
  // Prefer full "Service Address" block from Con Ed HTML (street + city/state/zip).
  const block = plain.match(
    /service\s*address\s+([^\n]+?)(?:\s*\n\s*)([A-Za-z .]+?\s*,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/i
  );
  if (block) {
    const street = block[1].replace(/\s+/g, " ").trim();
    const cityLine = block[2].replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
    if (/\d/.test(street) && street.length >= 6) {
      return cityLine ? `${street}, ${cityLine}` : street;
    }
  }
  // Prefer "Service Address" block from Con Ed HTML mail (street only fallback).
  const svc = plain.match(/service\s*address\s+([^\n]+?)(?:\s+brooklyn|\s+ny\b|\s+case\s*number|$)/i);
  if (svc) {
    const candidate = svc[1].replace(/\s+/g, " ").trim();
    if (/\d/.test(candidate) && candidate.length >= 6) {
      // If city/state/zip follows on the same flattened string, keep it.
      const after = plain.slice(plain.toLowerCase().indexOf(candidate.toLowerCase()) + candidate.length);
      const city = after.match(/^\s*(brooklyn|bronx|queens|manhattan|staten island|nyc)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
      if (city) {
        return `${candidate}, ${city[1].replace(/\s+/g, " ")}, ${city[2]} ${city[3]}`.replace(/\s+/g, " ").trim();
      }
      return candidate;
    }
  }
  const m = plain.match(STREET_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function parseClock(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m || "0", 10);
  const ap = (ampm || "").toLowerCase();
  if (ap.startsWith("p") && hour < 12) hour += 12;
  if (ap.startsWith("a") && hour === 12) hour = 0;
  return { hour, min };
}

function toIsoLocal(y, mo, d, hour, min) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo + 1)}-${pad(d)}T${pad(hour)}:${pad(min)}`;
}

/** "11:00", "1:00 PM" style labels for calendar descriptions. */
export function formatClockLabel(hour, min, withAmPm = false) {
  const h24 = hour;
  const m = min || 0;
  const pad = (n) => String(n).padStart(2, "0");
  if (!withAmPm) {
    // Prefer 12-hour without leading zero on hour for Levi's window copy ("11:00 and 1:00").
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${pad(m)}`;
  }
  const ap = h24 >= 12 ? "p.m." : "a.m.";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad(m)} ${ap}`;
}

/**
 * Floor a local ISO datetime (YYYY-MM-DDTHH:MM) to the previous half-hour slot.
 * 11:15 → 11:00, 11:45 → 11:30, 11:00 → 11:00. (Levi: half-hour increments only.)
 */
export function floorToHalfHour(isoLocal) {
  const raw = String(isoLocal || "").trim();
  if (!raw || !raw.includes("T")) return raw;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (!m) return raw;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  let min = parseInt(m[5], 10);
  if (min < 30) min = 0;
  else min = 30;
  return toIsoLocal(y, mo, d, hour, min);
}

/** Add minutes to a local ISO datetime string (no timezone math — civil clock). */
export function addMinutesToLocalIso(isoLocal, minutes) {
  const raw = String(isoLocal || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  let min = parseInt(m[5], 10) + (minutes || 0);
  while (min >= 60) {
    min -= 60;
    hour += 1;
  }
  while (min < 0) {
    min += 60;
    hour -= 1;
  }
  // Day rollover is rare for 30-min appointments; keep simple civil add.
  let day = d;
  while (hour >= 24) {
    hour -= 24;
    day += 1;
  }
  while (hour < 0) {
    hour += 24;
    day -= 1;
  }
  return toIsoLocal(y, mo, day, hour, min);
}

/**
 * Extract a customer appointment window like "between 11:00 and 1:00" / "from 11 AM to 1 PM".
 * Returns labels + clock parts, or null.
 */
export function extractTimeWindow(text) {
  const s = stripHtml(text);
  const re =
    /(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:and|to|-|–|—)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
  const m = s.match(re);
  if (!m) return null;
  let startAmpm = m[3] || "";
  let endAmpm = m[6] || "";
  // If only the end has am/pm, infer start is also morning when both are single-digit-ish.
  if (!startAmpm && endAmpm) {
    const sh = parseInt(m[1], 10);
    const eh = parseInt(m[4], 10);
    // "11 and 1 PM" → start AM; "10 and 12 PM" → start AM if end is PM and start > end in 12h.
    if (/p/i.test(endAmpm) && sh > eh) startAmpm = "am";
    else startAmpm = endAmpm;
  }
  if (startAmpm && !endAmpm) endAmpm = startAmpm;
  const start = parseClock(m[1], m[2], startAmpm);
  const end = parseClock(m[4], m[5], endAmpm);
  // Cross-noon without pm: "11:00 and 1:00" → treat 1:00 as PM when start is 11.
  if (!m[3] && !m[6] && start.hour >= 10 && end.hour < start.hour && end.hour < 12) {
    end.hour += 12;
  }
  const startLabel = formatClockLabel(start.hour, start.min, false);
  const endLabel = formatClockLabel(end.hour, end.min, false);
  return {
    startHour: start.hour,
    startMin: start.min,
    endHour: end.hour,
    endMin: end.min,
    startLabel,
    endLabel,
    text: `Appointment set between ${startLabel} and ${endLabel}.`,
  };
}

/** Pull YYYY-MM-DD from email text when a full datetime is missing. */
function extractDateOnly(text, refYear = new Date().getFullYear()) {
  const s = stripHtml(text);
  const named = s.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i
  );
  if (named) {
    const mo = MONTHS[named[1].toLowerCase()];
    if (mo != null) {
      const day = parseInt(named[2], 10);
      const year = named[3] ? parseInt(named[3], 10) : refYear;
      return toIsoLocal(year, mo, day, 0, 0).slice(0, 10);
    }
  }
  const slash = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const mo = parseInt(slash[1], 10) - 1;
    const day = parseInt(slash[2], 10);
    let year = parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    return toIsoLocal(year, mo, day, 0, 0).slice(0, 10);
  }
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : "";
}

/**
 * Resolve schedule start/end for an email insight.
 * - Window → start of window, 1h duration; description carries the full window.
 * - Exact time → floor to half-hour for the calendar slot; keep exact for the description.
 */
export function resolveScheduleTimes(text, refYear = new Date().getFullYear()) {
  const plain = stripHtml(text);
  const window = extractTimeWindow(plain);
  // Prefer a single exact clock when the email is not a window appointment.
  let exactDateTime = window ? "" : extractDateTimeRaw(plain, refYear);
  // Window emails may still name a date + a precise inspector time later; keep exact if present.
  if (window) {
    const maybeExact = extractDateTimeRaw(plain, refYear);
    // Only treat as "exact" when minutes are not on a clean window-start match.
    if (maybeExact) {
      const t = maybeExact.slice(11, 16);
      const winStart = `${String(window.startHour).padStart(2, "0")}:${String(window.startMin).padStart(2, "0")}`;
      if (t !== winStart) exactDateTime = maybeExact;
      else exactDateTime = maybeExact; // still record for description
    }
  }
  let dateTime = "";
  if (window) {
    const day =
      (exactDateTime && exactDateTime.slice(0, 10)) ||
      extractDateOnly(plain, refYear) ||
      "";
    if (day) {
      dateTime = `${day}T${String(window.startHour).padStart(2, "0")}:${String(window.startMin).padStart(2, "0")}`;
    }
  } else if (exactDateTime) {
    dateTime = floorToHalfHour(exactDateTime);
  }
  const endDateTime = dateTime ? addMinutesToLocalIso(dateTime, APPOINTMENT_DURATION_MINUTES) : "";
  return {
    exactDateTime: exactDateTime || "",
    dateTime: dateTime || "",
    endDateTime,
    timeWindow: window,
  };
}

/** Original extractDateTime — keeps tests that call it directly working. */
export function extractDateTime(text, refYear = new Date().getFullYear()) {
  return extractDateTimeRaw(text, refYear);
}

function extractDateTimeRaw(text, refYear = new Date().getFullYear()) {
  const s = stripHtml(text);
  // DOB: "7/30/2026 10:15 AM" or "on 7/30/2026 10:15 AM"
  const slashTime = s.match(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  if (slashTime) {
    const mo = parseInt(slashTime[1], 10) - 1;
    const day = parseInt(slashTime[2], 10);
    let year = parseInt(slashTime[3], 10);
    if (year < 100) year += 2000;
    const { hour, min } = parseClock(slashTime[4], slashTime[5], slashTime[6]);
    return toIsoLocal(year, mo, day, hour, min);
  }
  // "Jul 28, 2026 at 9:30 AM" / "July 15, 2026 at 2:00 PM"
  const coned = s.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  if (coned) {
    const mo = MONTHS[coned[1].toLowerCase()];
    if (mo != null) {
      const day = parseInt(coned[2], 10);
      const year = coned[3] ? parseInt(coned[3], 10) : refYear;
      const { hour, min } = parseClock(coned[4], coned[5], coned[6]);
      return toIsoLocal(year, mo, day, hour, min);
    }
  }
  // "Tuesday, July 21, 2026" (completed emails — date only)
  const weekdayDate = s.match(
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i
  );
  if (weekdayDate) {
    const mo = MONTHS[weekdayDate[1].toLowerCase()];
    if (mo != null) {
      const day = parseInt(weekdayDate[2], 10);
      const year = weekdayDate[3] ? parseInt(weekdayDate[3], 10) : refYear;
      return toIsoLocal(year, mo, day, 9, 0);
    }
  }
  const dt = s.match(DATE_TIME_RE);
  if (dt) {
    const datePart = dt[1].trim();
    const timePart = dt[2].trim();
    const tm = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!tm) return "";
    const { hour, min } = parseClock(tm[1], tm[2], tm[3]);
    const md = datePart.match(/(\w+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
    if (md) {
      const mo = MONTHS[md[1].toLowerCase()];
      if (mo == null) return "";
      const day = parseInt(md[2], 10);
      const year = md[3] ? parseInt(md[3], 10) : refYear;
      return toIsoLocal(year, mo, day, hour, min);
    }
  }
  const dOnly = s.match(DATE_ONLY_RE);
  if (dOnly) {
    const raw = dOnly[1];
    if (raw.includes("-")) return raw + "T09:00";
    const p = raw.split("/");
    if (p.length === 3) {
      const mo = parseInt(p[0], 10) - 1;
      const day = parseInt(p[1], 10);
      let year = parseInt(p[2], 10);
      if (year < 100) year += 2000;
      return toIsoLocal(year, mo, day, 9, 0);
    }
  }
  return "";
}

export function classifyAppointmentType(text) {
  const s = stripHtml(text).toLowerCase();
  if (/meter\s*(?:install|replacement|set)/.test(s)) return "meter_installation";
  if (/poe|point\s*of\s*entry|determine\s*poe/.test(s)) return "poe";
  if (
    /final\s*inspection|initial\s*inspection|electrical\s*inspection|inspection|inspect/.test(s)
  ) {
    return "inspection";
  }
  if (/appointment|scheduled|schedule|reminder/.test(s)) return "appointment";
  return "other";
}

/**
 * Outcome of the email — drives auto-calendar vs paperwork-only vs skip.
 * scheduled | reminder | cancelled | completed | other
 *
 * Levi 2026-07-22: only NEW "appointment set" emails auto-create calendar events.
 * Reminder / "upcoming" mail must not create (calendar cross-check may mark already-there).
 *
 * Cancel detection is intentionally strict. DOB "how to cancel" footers and Con Ed
 * "Reschedule the appointment" links must NOT mark a real scheduled email as cancelled
 * (that left the Smart Suggestion sheet looping every login).
 */
export function classifyEmailOutcome(subject = "", body = "") {
  const subj = stripHtml(subject).toLowerCase();
  const plain = stripHtml(body).toLowerCase();
  const s = [subj, plain].filter(Boolean).join("\n");

  // Strong cancel signals only — not instructional "to cancel" / "cancellation request" footers.
  const subjectCancelled =
    /\bcancell?ed\b/.test(subj) ||
    /\bcancellation\b/.test(subj);
  const bodyStrongCancel =
    /\b(appointment|inspection)\s+(has\s+been\s+|was\s+)?cancell?ed\b/.test(plain) ||
    /\bhas\s+been\s+cancell?ed\b/.test(plain) ||
    /\bwas\s+cancell?ed\b/.test(plain) ||
    /\bcancell?ed\s+due\s+to\b/.test(plain) ||
    /\bcancell?ed\s+by\b/.test(plain) ||
    /\byour\s+appointment\s+is\s+cancell?ed\b/.test(plain);
  // Bare "cancellation" in body is almost always "submit your cancellation request" help text.
  if (subjectCancelled || bodyStrongCancel) {
    return "cancelled";
  }

  if (/\bcompleted\b|\bpassed\b|\bpassed on\b|\binspection\s+passed\b/.test(s)) return "completed";
  // Reminder first — "reminder of an upcoming … scheduled" is still a reminder.
  if (/\breminder\b|\bfriendly reminder\b|\bupcoming\b/.test(s)) return "reminder";
  // True new appointment sets (Con Ed + DOB city).
  if (
    /\bhas\s+scheduled\b/.test(s) ||
    /\bappointment\s+is\s+set\b/.test(s) ||
    /\bhas\s+been\s+scheduled\b/.test(s) ||
    /\binspection\s+scheduled\b/.test(s) ||
    /\bscheduled\s+an?\s+(?:electrical\s+)?inspection\b/.test(s) ||
    /\bscheduled\s+a\s+con\s*edison\b/.test(s) ||
    /\bappointment\s+set\s+between\b/.test(s) ||
    (/\bscheduled\b/.test(s) && !/\breminder\b/.test(s))
  ) {
    return "scheduled";
  }
  if (/\bappointment\b/.test(s) && !/\breminder\b/.test(s)) return "scheduled";
  return "other";
}

const TYPE_LABELS = {
  inspection: "inspection",
  meter_installation: "meter installation",
  poe: "POE appointment",
  appointment: "appointment",
  other: "appointment",
};

export function appointmentTypeLabel(type, agency = "") {
  const base = TYPE_LABELS[type] || TYPE_LABELS.other;
  if (type === "inspection") {
    if (agency === "city") return "City electrical inspection";
    if (agency === "coned") return "Con Edison inspection";
    return "Inspection";
  }
  if (agency === "city") return `City ${base}`;
  if (agency === "coned" && type === "other") return "Energy Services appointment";
  return base;
}

export function parseEmailInsight({ from = "", subject = "", body = "", receivedAt = "", messageId = "" }) {
  const plainBody = stripHtml(body);
  const blob = [subject, plainBody].filter(Boolean).join("\n");
  const address = extractAddress(blob);
  const schedule = resolveScheduleTimes(blob);
  const dateTime = schedule.dateTime;
  const appointmentType = classifyAppointmentType(blob);
  const outcome = classifyEmailOutcome(subject, plainBody);
  const agency = classifyAgency(from, subject, plainBody);
  const dobJobNumber = extractDobJobNumber(blob);
  const fromLabel =
    agency === "city"
      ? "City / DOB"
      : /energy\s*services/i.test(from)
        ? "Energy Services"
        : /con\s*ed|@coned\.com|cpms\.noreply/i.test(from)
          ? "Con Edison"
          : "Email";

  const summaryParts = [];
  if (address) summaryParts.push(`at ${address}`);
  if (dateTime) summaryParts.push(`on ${dateTime.replace("T", " ").slice(0, 16)}`);
  if (schedule.timeWindow) summaryParts.push(`(${schedule.timeWindow.text.replace(/\.$/, "")})`);
  summaryParts.push(`for ${appointmentTypeLabel(appointmentType, agency)}`);
  if (dobJobNumber) summaryParts.push(`(job ${dobJobNumber})`);
  if (outcome === "cancelled") summaryParts.push("(cancelled)");
  if (outcome === "completed") summaryParts.push("(completed)");
  if (outcome === "reminder") summaryParts.push("(reminder only — not a new set)");

  return {
    id: messageId ? "ei-" + messageId : "ei-" + Date.now(),
    status: "pending",
    source: {
      type: "email",
      from: String(from || "").trim(),
      fromLabel,
      subject: String(subject || "").trim(),
      receivedAt: receivedAt || new Date().toISOString(),
      messageId: messageId || "",
    },
    agency,
    appointmentType,
    outcome,
    address,
    dateTime,
    exactDateTime: schedule.exactDateTime || "",
    endDateTime: schedule.endDateTime || "",
    timeWindow: schedule.timeWindow || null,
    dobJobNumber: dobJobNumber || "",
    summary: summaryParts.join(" "),
    emailSnippet: plainBody.slice(0, 400).trim() || String(subject || "").slice(0, 200),
    jobId: null,
    jobMatchScore: 0,
    proposedActions: [],
  };
}

/**
 * Plain-language description for the Google Calendar event.
 * Glanceable layout (Levi 2026-07-22 screenshot feedback):
 *  - who / agency first line
 *  - exact inspection time (and half-hour slot note if floored)
 *  - customer window if any
 *  - DOB job # when present
 *  - source line last
 * No leJobId / internal tags — job is linked via calEventId.
 */
export function buildAppointmentDescription(insight, job) {
  const lines = [];
  const type = insight?.appointmentType || "other";
  const agency = insight?.agency || "other";
  const window = insight?.timeWindow;
  const exact = insight?.exactDateTime || "";
  const scheduled = insight?.dateTime || "";
  const who = (job?.customer || "").trim();
  const agencyName =
    agency === "city" ? "NYC Department of Buildings" : agency === "coned" ? "Con Edison" : "Agency";

  if (who) lines.push(`Customer: ${who}`);

  if (window?.text) {
    lines.push(window.text);
  }

  if (type === "inspection" && exact && scheduled) {
    const exactLabel = formatClockLabel(
      parseInt(exact.slice(11, 13), 10),
      parseInt(exact.slice(14, 16), 10),
      true
    );
    const schedLabel = formatClockLabel(
      parseInt(scheduled.slice(11, 13), 10),
      parseInt(scheduled.slice(14, 16), 10),
      true
    );
    if (exact.slice(11, 16) !== scheduled.slice(11, 16)) {
      lines.push(
        agency === "city"
          ? `City electrical inspection at ${exactLabel}. Calendar slot ${schedLabel} (half-hour increments only).`
          : `Con Edison inspection at ${exactLabel}. Scheduled for ${schedLabel} because we only use half-hour increments.`
      );
    } else {
      lines.push(
        agency === "city"
          ? `City electrical inspection at ${exactLabel}.`
          : `Con Edison inspection at ${exactLabel}.`
      );
    }
  } else if (type === "inspection" && scheduled) {
    const schedLabel = formatClockLabel(
      parseInt(scheduled.slice(11, 13), 10),
      parseInt(scheduled.slice(14, 16), 10),
      true
    );
    lines.push(
      agency === "city"
        ? `City electrical inspection at ${schedLabel}.`
        : `Con Edison inspection at ${schedLabel}.`
    );
  } else if (scheduled && !window) {
    const schedLabel = formatClockLabel(
      parseInt(scheduled.slice(11, 13), 10),
      parseInt(scheduled.slice(14, 16) || "00", 10),
      true
    );
    if (schedLabel && !Number.isNaN(parseInt(scheduled.slice(11, 13), 10))) {
      lines.push(`Appointment at ${schedLabel}.`);
    }
  }

  if (insight?.dobJobNumber) {
    lines.push(`DOB job number ${insight.dobJobNumber}`);
  }

  const src =
    agency === "city"
      ? "From City / DOB email"
      : agency === "coned"
        ? "From Energy Services / Con Edison email"
        : "From email";
  lines.push(src);
  if (agencyName && type === "inspection") {
    // Agency already in lines above for inspections.
  }
  return lines.filter(Boolean).join("\n");
}

export function matchJobForInsight(insight, jobs, minScore = 0.55) {
  const addr = insight?.address || "";
  if (!addr) return { jobId: null, score: 0, job: null };
  let best = null;
  let bestScore = 0;
  for (const j of jobs || []) {
    if (j._archived || j._deleted) continue;
    const candidates = [j.serviceAddress, j.address, j.billingAddress].filter(Boolean);
    for (const c of candidates) {
      const score = addressSimilarity(addr, c);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
  }
  if (!best || bestScore < minScore) return { jobId: null, score: bestScore, job: null };
  return { jobId: best.id, score: bestScore, job: best };
}

export function buildProposedActions(insight, job, now = new Date()) {
  const type = insight?.appointmentType || "other";
  const outcome = insight?.outcome || "other";
  const agency = insight?.agency || "";
  const actions = [];
  const when = insight?.dateTime || "";
  const addr = insight?.address || job?.serviceAddress || job?.address || "";
  const typeLabel = appointmentTypeLabel(type, agency);
  const past = isPastAppointmentInsight(insight, now);

  // Only NEW appointment-set emails create calendar events (not pure reminders).
  // Past appointments are never scheduleable — no second calendar add after the day.
  const isNewSet = outcome === "scheduled" || outcome === "other";
  const scheduleable = isNewSet && !past;

  if (scheduleable) {
    actions.push({
      key: "calendar",
      label: when
        ? `Add ${typeLabel} to calendar (${when.replace("T", " ").slice(0, 16)})`
        : `Add ${typeLabel} to calendar`,
      enabled: true,
      defaultOn: true,
    });

    if (type === "inspection" || type === "appointment" || type === "poe") {
      actions.push({ key: "remind_1d", label: "Reminder 1 day before", enabled: true, defaultOn: true });
      actions.push({ key: "remind_1h", label: "Reminder 1 hour before", enabled: true, defaultOn: true });
    }
  } else if (outcome === "reminder" && !past) {
    actions.push({
      key: "note_reminder",
      label: "Reminder email only — won't add a second calendar appointment",
      enabled: true,
      defaultOn: true,
    });
  } else if (outcome === "cancelled") {
    actions.push({
      key: "note_cancelled",
      label: "Note cancelled appointment (no calendar add)",
      enabled: true,
      defaultOn: true,
    });
  } else if (outcome === "completed") {
    actions.push({
      key: "note_completed",
      label: "Note inspection completed (update paperwork)",
      enabled: true,
      defaultOn: true,
    });
  }

  if (job?.customer && scheduleable) {
    actions.push({
      key: "guest_customer",
      label: `Add ${job.customer} to the event`,
      enabled: true,
      defaultOn: true,
    });
  }
  if (job?.email && scheduleable) {
    actions.push({
      key: "guest_email",
      label: `Add customer email (${job.email}) to the event`,
      enabled: true,
      defaultOn: !!job.email,
    });
  }

  if (job?.id && type === "inspection") {
    const paperLabel =
      agency === "city"
        ? outcome === "completed"
          ? "Update City / DOB paperwork — inspection completed"
          : "Update City / DOB paperwork — Inspection scheduled"
        : outcome === "completed"
          ? "Update Con Ed paperwork — inspection completed"
          : "Update Con Ed paperwork — Inspection appointment";
    actions.push({
      key: "paperwork_inspection",
      label: paperLabel,
      enabled: true,
      defaultOn: true,
    });
  } else if (job?.id && type === "meter_installation") {
    actions.push({
      key: "paperwork_meter",
      label: "Update Con Ed paperwork — Meter installation date",
      enabled: true,
      defaultOn: true,
    });
  } else if (job?.id && outcome !== "cancelled") {
    actions.push({
      key: "paperwork_progress",
      label: "Update task progress on the job",
      enabled: true,
      defaultOn: true,
    });
  }

  if (addr && scheduleable) {
    actions.push({
      key: "calendar_location",
      label: `Set event location: ${addr}`,
      enabled: true,
      defaultOn: true,
    });
  }

  return actions;
}

export function formatInsightLead(insight, job) {
  const src = insight?.source?.fromLabel || "Email";
  const outcome = insight?.outcome || "other";
  let jobLine = job
    ? `I'm going to add this to the existing job for ${job.customer || "this customer"}.`
    : insight?.address
      ? `I found an address (${insight.address}) but no matching job yet.`
      : "I couldn't match this to a job address yet.";
  if (outcome === "cancelled") {
    jobLine = job
      ? `This appointment was cancelled for ${job.customer || "this customer"}.`
      : "This appointment was cancelled.";
  } else if (outcome === "completed") {
    jobLine = job
      ? `Inspection completed for ${job.customer || "this customer"} — I'll update the job.`
      : "Inspection marked completed.";
  } else if (outcome === "reminder") {
    jobLine = "This is only a reminder — I won't create a new calendar appointment from it.";
  }
  const appt = insight?.summary || appointmentTypeLabel(insight?.appointmentType, insight?.agency);
  return `From ${src}: ${appt}. ${jobLine}`;
}

/**
 * Friendly appointment date from local ISO "YYYY-MM-DDTHH:MM" (or date-only).
 * e.g. "Wed, Jul 8, 2026"
 */
export function formatInsightDateLabel(isoLocal) {
  const raw = String(isoLocal || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "9:30 AM" from local ISO or HH:MM fragment. */
export function formatInsightTimeLabel(isoLocal) {
  const raw = String(isoLocal || "").trim();
  if (!raw) return "";
  let hh;
  let mm;
  if (raw.includes("T")) {
    const t = raw.split("T")[1] || "";
    [hh, mm] = t.split(":");
  } else if (/^\d{1,2}:\d{2}/.test(raw)) {
    [hh, mm] = raw.split(":");
  } else {
    return "";
  }
  const hour = Number(hh);
  const min = Number(mm);
  if (!Number.isFinite(hour)) return "";
  const ap = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${String(Number.isFinite(min) ? min : 0).padStart(2, "0")} ${ap}`;
}

/**
 * Hours range for the notice: "9:30 AM – 10:30 AM" or single clock.
 * Prefers exact time when present; falls back to floored start + end.
 */
export function formatInsightHoursLabel(insight, event) {
  const start =
    event?.start ||
    insight?.exactDateTime ||
    insight?.dateTime ||
    "";
  const end = event?.end || insight?.endDateTime || "";
  const win = insight?.timeWindow;
  if (win && (win.startHour != null || win.text)) {
    // Window copy already human ("between 11:00 and 1:00")
    if (win.text) return String(win.text).replace(/\.$/, "");
    const a = formatClockLabel(win.startHour, win.startMin || 0, true);
    const b = formatClockLabel(win.endHour, win.endMin || 0, true);
    if (a && b) return `${a} – ${b}`;
  }
  const a = formatInsightTimeLabel(start);
  const b = formatInsightTimeLabel(end);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || "";
}

/** Source line for UI: "Email · Con Edison" */
export function formatInsightSourceLabel(insight) {
  const src = insight?.source || {};
  const kind = src.type === "email" || !src.type ? "Email" : String(src.type);
  const who = src.fromLabel || "Unknown";
  return `${kind} · ${who}`;
}

export function formatAppliedLead(insight, job) {
  const src = insight?.source?.fromLabel || "Email";
  const type = appointmentTypeLabel(insight?.appointmentType, insight?.agency);
  const dateLabel = formatInsightDateLabel(insight?.dateTime || insight?.exactDateTime);
  const hoursLabel = formatInsightHoursLabel(insight);
  const whenPretty =
    dateLabel && hoursLabel ? `${dateLabel} · ${hoursLabel}` : dateLabel || hoursLabel || "";
  const whenRaw = insight?.dateTime ? insight.dateTime.replace("T", " ").slice(0, 16) : "";
  const when = whenPretty || whenRaw;
  const who = job?.customer || "the job";
  const outcome = insight?.outcome || "other";
  if (insight?.skipReason === "already_on_calendar") {
    return when
      ? `From ${src}: ${type} for ${who} was already on your schedule (${when}) — left it alone.`
      : `From ${src}: ${type} for ${who} was already on your schedule — left it alone.`;
  }
  if (outcome === "completed") {
    return `From ${src}: marked ${type} completed for ${who}${when ? ` (${when})` : ""}. Already on the job.`;
  }
  if (outcome === "cancelled") {
    return `From ${src}: noted cancelled ${type} for ${who}. Nothing added to the calendar.`;
  }
  if (outcome === "reminder") {
    return when
      ? `From ${src}: reminder only for ${who} — appointment ${when}. No new calendar event.`
      : `From ${src}: reminder only for ${who} — no new calendar appointment.`;
  }
  const emailed = insight?.customerEmailed ? " and emailed the customer the invite" : "";
  return when
    ? `From ${src}: added ${type} for ${who} to your schedule calendar on ${when}${emailed}.`
    : `From ${src}: applied email update for ${who}.`;
}

/** True when dateTime is today or in the future (local clock). */
export function isDateTimeActionable(dateTime, now = new Date()) {
  if (!dateTime) return false;
  const raw = String(dateTime).trim();
  // Treat bare date as end of that day.
  const d = new Date(raw.length <= 10 ? raw + "T23:59:00" : raw);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() >= startOfToday.getTime();
}

/**
 * True when this insight's appointment day is already over (before today).
 * Used to drop stale suggestion/reminder popups (Levi 2026-07-22):
 * no smart-suggestion and no reminder sheet for yesterday's appointment.
 * Completed emails keep flowing (paperwork) even when the date is past.
 */
export function isPastAppointmentInsight(insight, now = new Date()) {
  if (!insight?.dateTime) return false;
  const outcome = insight.outcome || "other";
  // Completed = "inspection done" update — date is always past when the email arrives.
  if (outcome === "completed") return false;
  return !isDateTimeActionable(insight.dateTime, now);
}

/**
 * Whether the app should show any sheet for this insight (approve / done notice).
 * Past appointment reminders and late-arriving sets are silent — auto-ignored.
 */
export function shouldSurfaceInsight(insight, now = new Date()) {
  if (!insight) return false;
  if (isPastAppointmentInsight(insight, now)) return false;
  return true;
}

/**
 * Silent auto-apply when we have a strong job match and a clear NEW appointment set.
 * Reminder emails never auto-create (Levi 2026-07-22) — they may be auto-dismissed
 * elsewhere after a calendar cross-check. Weak matches still need Levi's approve sheet.
 */
export function canAutoApply(insight, job, now = new Date()) {
  if (!insight || !job?.id) return false;
  if ((insight.jobMatchScore || 0) < AUTO_APPLY_MIN_SCORE) return false;
  const outcome = insight.outcome || "other";
  if (outcome === "cancelled") return false;
  // Reminder-only: do not create calendar events from reminders.
  if (outcome === "reminder") return false;
  // Past appointment day: never auto-create / never suggest.
  if (isPastAppointmentInsight(insight, now)) return false;
  // Completed inspections: auto-update paperwork only (still notify).
  if (outcome === "completed") return true;
  // Need a date/time on the calendar, and not a stale past appointment.
  if (!insight.dateTime || !isDateTimeActionable(insight.dateTime, now)) return false;
  // Only true new appointment sets (and loose "other" with a clear datetime).
  return outcome === "scheduled" || outcome === "other";
}

/**
 * Whether this email should create a calendar event (new set only, not reminder).
 */
export function wantsNewCalendarAppointment(insight, now = new Date()) {
  const outcome = insight?.outcome || "other";
  if (outcome === "reminder" || outcome === "cancelled" || outcome === "completed") return false;
  if (!insight?.dateTime) return false;
  // Never create calendar events for appointments that already happened.
  return isDateTimeActionable(insight.dateTime, now);
}

export function defaultActionKeys(insight, job) {
  const actions = insight?.proposedActions?.length
    ? insight.proposedActions
    : buildProposedActions(insight, job);
  return actions.filter((a) => a.defaultOn !== false && a.enabled !== false).map((a) => a.key);
}

export function enrichInsight(raw, jobs) {
  const insight = { ...raw };
  // Always re-derive outcome from the email text so a bad stored value (e.g. DOB
  // "cancellation request" footer false-positive) self-heals on the next open.
  const subject = insight.source?.subject || "";
  const bodyText = insight.emailSnippet || insight.source?.body || "";
  insight.outcome = classifyEmailOutcome(subject, bodyText);
  if (!insight.agency) {
    insight.agency = classifyAgency(
      insight.source?.from || "",
      subject,
      bodyText
    );
  }
  // Drop the stale "(cancelled)" tag from older summaries after reclassify.
  if (insight.outcome !== "cancelled" && typeof insight.summary === "string") {
    insight.summary = insight.summary.replace(/\s*\(cancelled\)\s*$/i, "").trim();
  }
  const match = matchJobForInsight(insight, jobs);
  insight.jobId = match.jobId || insight.jobId || null;
  insight.jobMatchScore = match.score || insight.jobMatchScore || 0;
  insight.proposedActions = buildProposedActions(insight, match.job);
  insight.lead = formatInsightLead(insight, match.job);
  insight.appliedLead = formatAppliedLead(insight, match.job);
  insight.canAutoApply = canAutoApply(insight, match.job);
  return insight;
}

export function paperworkPatchForInsight(insight, dateTime) {
  const dt = dateTime || insight?.dateTime || "";
  if (!dt) return {};
  const type = insight?.appointmentType;
  const agency = insight?.agency || "";
  if (type === "inspection") {
    if (agency === "city") {
      return {
        paperwork: {
          dob: {
            enabled: true,
            dates: { "Inspection scheduled": dt },
          },
        },
      };
    }
    return {
      paperwork: {
        coned: {
          enabled: true,
          dates: { "Inspection appointment": dt },
        },
      },
    };
  }
  if (type === "meter_installation") {
    return {
      paperwork: {
        coned: {
          enabled: true,
          dates: { "Meter installation date": dt.slice(0, 10) },
        },
      },
    };
  }
  return {};
}

export { normalizeAddress, addressSimilarity };
// pro-src re-exports via src/lib/emailInsight.js
