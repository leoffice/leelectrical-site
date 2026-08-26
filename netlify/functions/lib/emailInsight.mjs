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

/** Our own outbound mail — never treat as agency schedule notifications (Levi 2026-08-05). */
const OFFICE_OUTBOUND_RE =
  /office@leelectrical\.us|office@amraelectrical\.com|office@levielectric\.com|filing\.blznyc@gmail\.com|@leelectrical\.us\b|@amraelectrical\.com\b|bmmkumer@gmail\.com|levi\.?kumer|lefkowitz/i;

export function isOfficeOutboundEmail(from = "") {
  return OFFICE_OUTBOUND_RE.test(String(from || ""));
}

/**
 * Body looks like our office writing a reply (discussion), not City/Con Ed notifying us.
 * Catches threads where From is missing/wrong but the wording is clearly ours
 * (Levi 2026-08-05: "Email understood" on a plain email response = bloat).
 */
export function isOfficeConversationBody(body = "", subject = "") {
  const plain = stripHtml(body).trim();
  const subj = stripHtml(subject).trim();
  if (!plain && !subj) return false;
  // Classic office openers / status discussion (not "your inspection is scheduled").
  if (
    /^(hi|hello|hey|good\s+(morning|afternoon|evening))\s+[A-Z][a-z]+[,.]?\s/i.test(plain) ||
    /\bthank you for the note\b/i.test(plain) ||
    /\bto clarify the current status\b/i.test(plain) ||
    /\bthe two objections\b/i.test(plain) ||
    /\bwe were required to call for a new inspection\b/i.test(plain) ||
    /\bas discussed\b/i.test(plain) ||
    /\bplease advise\b/i.test(plain) ||
    /\bper our (call|conversation|email)\b/i.test(plain)
  ) {
    return true;
  }
  // Re:/Fw: with no agency schedule language in the visible reply text → discussion.
  if (/^(re|fw|fwd)\s*:/i.test(subj)) {
    const head = plain.slice(0, 500);
    const hasAgencySetLang =
      /\bappointment\s+is\s+set\b/i.test(head) ||
      /\bhas\s+(?:been\s+)?scheduled\b/i.test(head) ||
      /\bwe\s+have\s+scheduled\b/i.test(head) ||
      /\binspection\s+is\s+scheduled\s+for\b/i.test(head) ||
      /\byour\s+(?:con\s*edison|electrical)\s+appointment\b/i.test(head);
    // Quoted original often still has the old "Inspection Scheduled" line — ignore that.
    // If the first ~500 chars read like a human reply, treat as conversation.
    if (!hasAgencySetLang && plain.length > 40) {
      if (
        /\b(thank you|thanks|to clarify|please|we (?:are|were|have|will)|i (?:am|have|will)|the (?:two |current )?status|objection|close-?out)\b/i.test(
          head
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Real City / Con Ed sender (not our office, not empty). */
export function isAgencySender(from = "") {
  const f = String(from || "");
  if (!f.trim()) return false;
  if (isOfficeOutboundEmail(f)) return false;
  return (
    ENERGY_SENDER_RE.test(f) ||
    /buildings\.nyc\.gov|dobnow|@buildings\.nyc\.gov|cpms\.noreply|@coned\.com|@conedison\.com|energy-services/i.test(
      f
    )
  );
}

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
  // Our own Re:/reply threads often keep "Con Edison" / "Inspection Scheduled" in the subject —
  // that must not re-trigger agency email handling (Levi 2026-08-05 bloatware popup).
  if (isOfficeOutboundEmail(from)) return false;
  const blob = [from, subject, body].join(" ");
  return ENERGY_SENDER_RE.test(blob) || CITY_DOB_SENDER_RE.test(blob);
}

/** True when mail is from NYC DOB / City electrical (not Con Ed). */
export function isCityDobEmail(from, subject = "", body = "") {
  if (isOfficeOutboundEmail(from)) return false;
  const fromS = String(from || "");
  // Prefer real DOB senders — subject alone ("Re: Inspection Scheduled…") is not enough.
  if (/buildings\.nyc\.gov|dobnow|@buildings\.nyc\.gov/i.test(fromS)) {
    return !ENERGY_SENDER_RE.test(fromS);
  }
  const blob = [from, subject, body].join(" ");
  // Allow body/letterhead matches only when From is not us and not pure Re: office noise.
  if (/^(re|fw|fwd)\s*:/i.test(String(subject || "").trim())) return false;
  return CITY_DOB_SENDER_RE.test(blob) && !ENERGY_SENDER_RE.test(fromS);
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
 * Window length in hours (civil clock). Returns 0 if missing.
 * Levi 2026-07-22: a ~3 hour window is almost always a meter installation set.
 */
export function windowDurationHours(window) {
  if (!window || window.startHour == null || window.endHour == null) return 0;
  const a = Number(window.startHour) + Number(window.startMin || 0) / 60;
  const b = Number(window.endHour) + Number(window.endMin || 0) / 60;
  const d = b - a;
  return d > 0 ? d : d + 24;
}

/** True when the customer window is about 3 hours (meter install signal). */
export function isMeterInstallWindow(window) {
  const h = windowDurationHours(window);
  return h >= 2.5 && h <= 3.5;
}

/**
 * Levi preferred window copy: "BTWN 8:00 and 11:00 a.m."
 * Same am/pm once when both ends share it; both labeled when they cross noon.
 */
export function formatWindowBtwn(window) {
  if (!window) return "";
  const sh = Number(window.startHour);
  const sm = Number(window.startMin || 0);
  const eh = Number(window.endHour);
  const em = Number(window.endMin || 0);
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) {
    return window.text || "";
  }
  const startAp = sh >= 12 ? "p.m." : "a.m.";
  const endAp = eh >= 12 ? "p.m." : "a.m.";
  const startClock = formatClockLabel(sh, sm, false);
  const endClock = formatClockLabel(eh, em, false);
  if (startAp === endAp) {
    return `BTWN ${startClock} and ${endClock} ${startAp}`;
  }
  return `BTWN ${startClock} ${startAp} and ${endClock} ${endAp}`;
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
  const win = {
    startHour: start.hour,
    startMin: start.min,
    endHour: end.hour,
    endMin: end.min,
    startLabel,
    endLabel,
  };
  // Canonical window copy — BTWN + a.m./p.m. (already ends with period in a.m./p.m.).
  win.text = formatWindowBtwn(win);
  return win;
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
  // "Jul 28, 2026 at 9:30 AM" / "July 15, 2026 at 2:00 PM" / "Aug 5, 2026 1:33:29 PM"
  // Seconds optional — Con Ed inquiry comment stamps include :SS and used to drop PM
  // (CI-1310863 false 1:33 AM slot — Levi 2026-08-05).
  const coned = s.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)\b/i
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
  // Also allow seconds before am/pm so "1:33:29 PM" keeps PM (not 1:33 AM).
  const dtWithSecs = s.match(
    /(?:on\s+)?(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)[\s,]+(?:at\s+)?(\d{1,2}):(\d{2}):\d{2}\s*(am|pm)\b/i
  );
  if (dtWithSecs) {
    const md = dtWithSecs[1].trim().match(/(\w+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
    if (md) {
      const mo = MONTHS[md[1].toLowerCase()];
      if (mo != null) {
        const day = parseInt(md[2], 10);
        const year = md[3] ? parseInt(md[3], 10) : refYear;
        const { hour, min } = parseClock(dtWithSecs[2], dtWithSecs[3], dtWithSecs[4]);
        return toIsoLocal(year, mo, day, hour, min);
      }
    }
  }
  const dt = s.match(DATE_TIME_RE);
  if (dt) {
    const datePart = dt[1].trim();
    const timePart = dt[2].trim();
    const tm = timePart.match(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?/i);
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

export function classifyAppointmentType(text, timeWindow = null) {
  const s = stripHtml(text).toLowerCase();
  // Explicit meter language first.
  if (
    /meter\s*(?:install|replacement|set|appointment)/.test(s) ||
    /electric\s+service\s+(?:repair\/)?installation/.test(s) ||
    /service\s+repair\/installation/.test(s) ||
    /(?:repair\/)?installation\s+at\b/.test(s)
  ) {
    return "meter_installation";
  }
  // Levi 2026-07-22: a ~3 hour Con Ed / Energy Services window is a meter install.
  if (isMeterInstallWindow(timeWindow)) return "meter_installation";
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
export function classifyEmailOutcome(subject = "", body = "", from = "") {
  const subj = stripHtml(subject).toLowerCase();
  const plain = stripHtml(body).toLowerCase();
  const s = [subj, plain].filter(Boolean).join("\n");
  // Levi 2026-08-05: office replies / conversation threads are discussion, not new sets.
  // Subject "Re: Inspection Scheduled for BLZ…" was falsely opening "Email understood" + calendar.
  if (isOfficeOutboundEmail(from)) return "other";
  if (isOfficeConversationBody(body, subject)) return "other";
  // Any reply-thread subject: do not treat the subject line alone as a new schedule.
  // Agency re-sends usually restate "has scheduled" / "appointment is set" in the body.
  const isReplySubject = /^(re|fw|fwd)\s*:/i.test(subj);
  // Reply without a real agency From — never a new set from subject alone.
  if (isReplySubject && !isAgencySender(from)) {
    // Only allow scheduled if the reply body itself is agency language (rare forward).
    const head = plain.slice(0, 600);
    const bodyIsAgencySet =
      /\bappointment\s+is\s+set\b/.test(head) ||
      /\bhas\s+(?:been\s+)?scheduled\b/.test(head) ||
      /\bwe\s+have\s+scheduled\b/.test(head);
    if (!bodyIsAgencySet) return "other";
  }

  // Acknowledgment / "we received your request" is case-open confirmation only.
  // Letter "Date:" must NOT become a calendar appointment (Levi 2026-08-03 —
  // MC-941580 Acknowledgment Letter was wrongly offered as Energy Services appt).
  // Real appointment emails say appointment / inspection scheduled / APPT- / etc.
  if (
    /\backnowledg(?:e)?ment\s+letter\b/.test(s) ||
    /\backnowledg(?:e)?ment\b/.test(subj) ||
    // Inquiry / case open confirmations are not field appointments (Levi 2026-08-05 CI-1310863).
    /\binquiry\s+id\b/.test(subj) ||
    /\bcon\s*edison\s+inquiry\b/.test(subj) ||
    /\bci-\d+/i.test(subj) ||
    (/\bwe have received your request\b/.test(plain) &&
      !/\bappointment\b/.test(s) &&
      !/\binspection\s+scheduled\b/.test(s) &&
      !/\bappt-\d+/.test(s))
  ) {
    return "acknowledgment";
  }

  // Customer To-Do / case status updates (Levi 2026-08-03 MC-941580 false 8pm appt).
  // Subject "Status Update for Customer To-Do List" + letterhead "Date:" is NOT a visit.
  // Levi 2026-08-05: never notify / never calendar — silent todo refresh only.
  if (
    /\bto-?do\s+list\b/.test(subj) ||
    /\bstatus\s+update\s+for\s+customer\b/.test(subj) ||
    /\bcustomer\s+to-?do\b/.test(s) ||
    (/\bdocumentation\s+has\s+been\b/.test(plain) &&
      /\breviewed\b/.test(plain) &&
      !/\bappointment\s+is\s+set\b/.test(s) &&
      !/\binspection\s+scheduled\b/.test(s) &&
      !/\bappt-\d+/.test(s))
  ) {
    return "todo_update";
  }

  // Reschedule BEFORE cancel: "cancelled and rescheduled to…" is a move, not a cancel
  // (Levi 2026-07-27). Past-tense only — footer "Log in to Reschedule" must not match.
  const subjectRescheduled =
    /\breschedul(?:ed|ing)\b/.test(subj) ||
    /\b(?:appointment|inspection)\s+(?:date\s+)?chang(?:e|ed)\b/.test(subj) ||
    /\bnew\s+(?:date|time|appointment\s+(?:date|time))\b/.test(subj);
  const bodyRescheduled =
    /\b(?:appointment|inspection|visit)\s+(?:has\s+been\s+|was\s+|is\s+being\s+)?reschedul(?:ed)\b/.test(
      plain
    ) ||
    /\bhas\s+been\s+reschedul(?:ed)\b/.test(plain) ||
    /\bwas\s+reschedul(?:ed)\b/.test(plain) ||
    /\breschedul(?:ed)\s+(?:to|for|from)\b/.test(plain) ||
    /\b(?:appointment|inspection)\s+(?:has\s+been\s+|was\s+)?moved\s+to\b/.test(plain);
  if (subjectRescheduled || bodyRescheduled) {
    return "rescheduled";
  }

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

  // DOB NOW terminal "Work Complete" / "status updated to Complete" (not the word "completed").
  // Maps to completed outcome so paperwork + city brain auto-apply; city classifier → signed_off.
  if (/\bwork\s+complete\b|\bstatus\s+updated\s+to\s+complete\b/.test(s)) return "completed";
  if (/\bcompleted\b|\bpassed\b|\bpassed on\b|\binspection\s+passed\b/.test(s)) return "completed";

  // True new appointment sets FIRST (Con Ed APPT confirmations + DOB city).
  // Con Ed footers say "upcoming service appointment" for SMS marketing — that must
  // NOT demote a real "Your appointment is set" / APPT-* email to reminder-only
  // (Winthrop APPT-722669 lost its calendar slot because of this — Levi 2026-07-30).
  // Never treat To-Do / status-update mail as a new set (even if body says "scheduled").
  const isTodoMail =
    /\bto-?do\s+list\b/.test(subj) ||
    /\bstatus\s+update\s+for\s+customer\b/.test(subj) ||
    /\bcustomer\s+to-?do\b/.test(s);
  // Reply subjects: only body language counts (subject already says "Inspection Scheduled").
  const setBlob = isReplySubject ? plain : s;
  const isNewSet =
    !isTodoMail &&
    (/\bappointment\s+is\s+set\b/.test(setBlob) ||
      (!isReplySubject && /\byour\s+con\s*edison\s+appointment\b/.test(subj)) ||
      (!isReplySubject && /\bappt-\d+/i.test(subj)) ||
      /\bhas\s+scheduled\b/.test(setBlob) ||
      /\bhas\s+been\s+scheduled\b/.test(setBlob) ||
      (!isReplySubject && /\binspection\s+scheduled\b/.test(s)) ||
      (isReplySubject &&
        /\binspection\s+scheduled\b/.test(plain) &&
        /\b(has\s+been\s+scheduled|is\s+scheduled\s+for|we\s+have\s+scheduled)\b/.test(plain)) ||
      /\bscheduled\s+an?\s+(?:electrical\s+)?inspection\b/.test(setBlob) ||
      /\bscheduled\s+a\s+con\s*edison\b/.test(setBlob) ||
      /\bappointment\s+set\s+between\b/.test(setBlob) ||
      /\bwe\s+will\s+arrive\s+between\b/.test(setBlob) ||
      // Require appointment/inspection context — bare "scheduled" in footers is not a set.
      (!isReplySubject &&
        /\bscheduled\b/.test(s) &&
        !/\breminder\b/.test(s) &&
        /\b(appointment|inspection|visit|meter\s+install)\b/.test(s)));
  if (isNewSet) return "scheduled";

  // Reminder only when the mail is actually a reminder — not bare "upcoming" in footers.
  if (
    /\breminder\b/.test(s) ||
    /\bfriendly reminder\b/.test(s) ||
    /\breminder\s+of\s+an?\s+upcoming\b/.test(s)
  ) {
    return "reminder";
  }
  // Bare "appointment" in footers/marketing/To-Do letters must NOT create calendar events.
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
  if (type === "meter_installation") {
    if (agency === "coned") return "Con Edison meter installation appointment";
    return "Meter installation appointment";
  }
  if (agency === "city") return `City ${base}`;
  if (agency === "coned" && (type === "other" || type === "appointment")) {
    return "Energy Services appointment";
  }
  return base;
}

export function parseEmailInsight({
  from = "",
  to = "",
  subject = "",
  body = "",
  receivedAt = "",
  messageId = "",
}) {
  const plainBody = stripHtml(body);
  const blob = [subject, plainBody].filter(Boolean).join("\n");
  const address = extractAddress(blob);
  const outcome = classifyEmailOutcome(subject, plainBody, from);
  // Acknowledgments + To-Do list updates are not appointments — ignore letter "Date:"
  // and inquiry comment clocks (Levi 2026-08-05: no fake Energy Services appt).
  const noSchedule = outcome === "acknowledgment" || outcome === "todo_update";
  const schedule = noSchedule
    ? { dateTime: "", exactDateTime: "", endDateTime: "", timeWindow: null }
    : resolveScheduleTimes(blob);
  const dateTime = schedule.dateTime;
  // Pass window so a 3-hour slot classifies as meter install even without "meter" in text.
  const appointmentType = noSchedule ? "other" : classifyAppointmentType(blob, schedule.timeWindow);
  const agency = classifyAgency(from, subject, plainBody);
  const dobJobNumber = extractDobJobNumber(blob);
  const conedCaseNumber = extractConedCaseNumber(blob) || "";
  const toHeader = String(to || "").trim();
  const recipientEmails = extractEmailsFromText(toHeader);
  const customerNameHints = extractCustomerNameHints(blob, toHeader);
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
  if (conedCaseNumber) summaryParts.push(`(${conedCaseNumber})`);
  if (outcome === "cancelled") summaryParts.push("(cancelled)");
  if (outcome === "completed") summaryParts.push("(completed)");
  if (outcome === "reminder") summaryParts.push("(reminder only — not a new set)");
  if (outcome === "rescheduled") summaryParts.push("(rescheduled — replaces the earlier appointment)");
  if (outcome === "acknowledgment") summaryParts.push("(acknowledgment only — not an appointment)");
  if (outcome === "todo_update") summaryParts.push("(to-do list update — paperwork only)");

  return {
    id: messageId ? "ei-" + messageId : "ei-" + Date.now(),
    status: "pending",
    source: {
      type: "email",
      from: String(from || "").trim(),
      to: toHeader,
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
    conedCaseNumber,
    recipientEmails,
    customerNameHints,
    customerNameHint: customerNameHints[0] || "",
    summary: summaryParts.join(" "),
    emailSnippet: plainBody.slice(0, 400).trim() || String(subject || "").slice(0, 200),
    jobId: null,
    jobMatchScore: 0,
    matchPoints: 0,
    matchEvidence: null,
    proposedActions: [],
  };
}

/**
 * Plain-language description for the Google Calendar event.
 * Glanceable layout (Levi 2026-07-22 screenshot feedback + meter-install review):
 *  - Customer / Phone / Email contact block first
 *  - What it is (meter install / inspection) + BTWN window or exact time
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
  const phone = String(job?.phone || job?.mobile || job?.cell || "").trim();
  const email = String(job?.email || "").trim();
  const typeLabel = appointmentTypeLabel(type, agency);
  const btwn = window ? formatWindowBtwn(window) : "";

  if (who) lines.push(`Customer: ${who}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (who || phone || email) lines.push("");

  if (type === "meter_installation" || (window && isMeterInstallWindow(window))) {
    // e.g. "Con Edison meter installation appointment BTWN 8:00 and 11:00 a.m."
    // btwn already ends with a.m./p.m. — do not add a second period.
    lines.push(btwn ? `${typeLabel} ${btwn}` : `${typeLabel}.`);
  } else if (type === "inspection" && exact && scheduled) {
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
  } else if (window && btwn) {
    lines.push(`${typeLabel} ${btwn}`);
  } else if (scheduled) {
    const schedLabel = formatClockLabel(
      parseInt(scheduled.slice(11, 13), 10),
      parseInt(scheduled.slice(14, 16) || "00", 10),
      true
    );
    if (schedLabel && !Number.isNaN(parseInt(scheduled.slice(11, 13), 10))) {
      lines.push(`${typeLabel} at ${schedLabel}.`);
    }
  } else {
    lines.push(`${typeLabel}.`);
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
  return lines.filter((l, i, arr) => {
    // Drop trailing blank; keep intentional blank after contact block.
    if (l !== "") return true;
    return i > 0 && i < arr.length - 1 && arr[i - 1] !== "";
  }).join("\n");
}

/** Con Edison / Energy Services case id from subject or body (e.g. MC-941580). */
export function extractConedCaseNumber(text) {
  const m = String(text || "").match(/\b(MC-\d{4,})\b/i);
  return m ? m[1].toUpperCase() : "";
}

/** Invoice / estimate / LE-#### tokens from email text. */
export function extractDocNumbers(text) {
  const s = String(text || "");
  const out = new Set();
  const patterns = [
    /\b(?:invoice|inv|estimate|est|doc(?:ument)?(?:\s*#)?)\s*[#:]?\s*([A-Z]{0,3}-?\d{4,})\b/gi,
    /\b(LE-\d{3,})\b/gi,
    /\b(?:#|No\.?\s*)(\d{5,6})\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(s))) {
      const raw = String(m[1] || "").trim().toUpperCase();
      if (raw) out.add(raw.replace(/^0+/, "") || raw);
    }
  }
  return [...out];
}

function normalizePersonName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\b(inc|llc|corp|co|the|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" ").filter((w) => w.length > 1));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

/** Pull emails from a To/Cc header or free text. */
export function extractEmailsFromText(text) {
  const s = String(text || "");
  const out = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  while ((m = re.exec(s))) {
    const e = m[0].toLowerCase();
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * Customer name hints from Dear … / Customer: … / Account Name: …
 * and display-names in To: headers ("Goodness and kindness" <x@y.com>).
 */
export function extractCustomerNameHints(text, toHeader = "") {
  const hints = [];
  const blob = String(text || "");
  const push = (v) => {
    const t = String(v || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 3 && !hints.some((h) => h.toLowerCase() === t.toLowerCase())) hints.push(t);
  };
  for (const re of [
    /\bdear\s+([^,\n\r]{3,60})/gi,
    /\bcustomer\s*[:\-]\s*([^\n\r]{3,60})/gi,
    /\baccount\s+name\s*[:\-]\s*([^\n\r]{3,60})/gi,
    /\battention\s*[:\-]\s*([^\n\r]{3,60})/gi,
  ]) {
    let m;
    while ((m = re.exec(blob))) push(m[1]);
  }
  const to = String(toHeader || "");
  const named = [...to.matchAll(/"([^"]{3,80})"|([^,<"]{3,80})\s*</g)];
  for (const m of named) push(m[1] || m[2]);
  return hints;
}

function insightMatchBlob(insight) {
  return [
    insight?.conedCaseNumber,
    insight?.source?.subject,
    insight?.source?.to,
    insight?.emailSnippet,
    insight?.summary,
    insight?.customerNameHint,
    ...(insight?.customerNameHints || []),
  ]
    .filter(Boolean)
    .join("\n");
}

function jobDocTokens(job) {
  const out = new Set();
  const push = (v) => {
    const raw = String(v || "").trim().toUpperCase();
    if (!raw) return;
    out.add(raw);
    out.add(raw.replace(/^0+/, "") || raw);
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 4) out.add(digits);
  };
  push(job?.invoiceNo);
  push(job?.DocNumber);
  push(job?.docNumber);
  push(job?.estimateNo);
  push(job?.estimateNumber);
  push(job?.docNo);
  push(job?.number);
  // qbo-est-201963 / qbo-251720 style ids
  const id = String(job?.id || "");
  const idNum = id.match(/(?:est-|inv-)?(\d{4,})$/i);
  if (idNum) push(idNum[1]);
  return out;
}

function jobCaseNumber(job) {
  return String(job?.conedCaseNumber || job?.paperwork?.coned?.caseNumber || "").toUpperCase();
}

/**
 * Three verification points (Levi 2026-08-26):
 *  1. Address
 *  2. Identity — customer name addressed-to / To: email
 *  3. Document — Con Ed case # or existing invoice/estimate #
 * Prefer 2+ points; never crown address-only as a perfect match when another job shares the street.
 */
export function scoreJobVerification(insight, job) {
  const addr = insight?.address || "";
  const blob = insightMatchBlob(insight);
  const caseNo =
    extractConedCaseNumber(blob) ||
    String(insight?.conedCaseNumber || "").toUpperCase() ||
    "";
  const docNums = extractDocNumbers(blob);
  const toEmails = [
    ...extractEmailsFromText(insight?.source?.to || ""),
    ...extractEmailsFromText(insight?.recipientEmails?.join?.(" ") || ""),
  ];
  const nameHints = [
    ...(insight?.customerNameHints || []),
    insight?.customerNameHint,
    ...extractCustomerNameHints(blob, insight?.source?.to || ""),
  ].filter(Boolean);

  const addrCandidates = [job?.serviceAddress, job?.address, job?.billingAddress].filter(Boolean);
  let addressScore = 0;
  for (const c of addrCandidates) {
    addressScore = Math.max(addressScore, addressSimilarity(addr, c));
  }
  const addressOk = addressScore >= 0.55;

  const jobEmails = extractEmailsFromText(job?.email || "");
  let emailOk = false;
  for (const je of jobEmails) {
    if (toEmails.includes(je)) emailOk = true;
    // Body sometimes repeats the customer mailbox.
    if (extractEmailsFromText(blob).includes(je)) emailOk = true;
  }
  let nameScore = 0;
  const jobNames = [job?.customer, job?.businessName, job?.billTo].filter(Boolean);
  for (const hint of nameHints) {
    for (const jn of jobNames) {
      nameScore = Math.max(nameScore, nameSimilarity(hint, jn));
    }
  }
  const identityOk = emailOk || nameScore >= 0.6;

  const jobCase = jobCaseNumber(job);
  const caseOk = !!(caseNo && jobCase && caseNo === jobCase);
  const jobDocs = jobDocTokens(job);
  let invoiceOk = false;
  for (const d of docNums) {
    if (jobDocs.has(d) || jobDocs.has(d.replace(/\D/g, ""))) invoiceOk = true;
  }
  const documentOk = caseOk || invoiceOk;

  const points = (addressOk ? 1 : 0) + (identityOk ? 1 : 0) + (documentOk ? 1 : 0);
  // Weighted score: document + identity dominate street-only collisions (Lamp Lighter vs Goodness).
  let score =
    (addressOk ? 0.45 * addressScore : 0) +
    (emailOk ? 0.4 : nameScore >= 0.6 ? 0.35 * nameScore : 0) +
    (caseOk ? 0.45 : invoiceOk ? 0.35 : 0);
  if (points === 1 && addressOk) score = Math.max(score, addressScore);
  if (points === 1 && identityOk && !addressOk) score = Math.max(score, emailOk ? 0.72 : 0.65);
  if (points === 1 && documentOk && !addressOk) score = Math.max(score, caseOk ? 0.9 : 0.75);
  if (points >= 2) score = Math.max(score, 0.78 + 0.07 * points);
  if (points >= 3) score = Math.max(score, 0.98);
  if (caseOk && (addressOk || identityOk)) score = Math.max(score, 0.97);
  // Prefer open / local when scores otherwise tie.
  const tieBreak =
    (String(job?.id || "").startsWith("local-") ? 0.015 : 0) +
    (Number(job?.openBalance) > 0 ? 0.01 : 0) -
    (job?.paid ? 0.02 : 0);
  return {
    addressOk,
    identityOk,
    documentOk,
    addressScore,
    nameScore,
    emailOk,
    caseOk,
    invoiceOk,
    points,
    score: Math.min(1, score + tieBreak),
    evidence: {
      address: addressOk,
      identity: identityOk,
      document: documentOk,
    },
  };
}

export function matchJobForInsight(insight, jobs, minScore = 0.55) {
  const list = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  if (!list.length) return { jobId: null, score: 0, job: null, points: 0, evidence: null };

  let best = null;
  let bestMeta = null;
  for (const j of list) {
    const meta = scoreJobVerification(insight, j);
    if (!bestMeta || meta.score > bestMeta.score || (meta.score === bestMeta.score && meta.points > bestMeta.points)) {
      best = j;
      bestMeta = meta;
    }
  }
  if (!best || !bestMeta) return { jobId: null, score: 0, job: null, points: 0, evidence: null };

  // Need at least one solid point; address-only must clear minScore.
  if (bestMeta.points === 0) {
    return { jobId: null, score: bestMeta.score, job: null, points: 0, evidence: bestMeta.evidence };
  }
  if (bestMeta.points === 1 && bestMeta.addressOk && bestMeta.addressScore < minScore) {
    return { jobId: null, score: bestMeta.addressScore, job: null, points: 1, evidence: bestMeta.evidence };
  }
  // Address-only: if another job has 2+ points, prefer it (Lamp Lighter street vs Goodness case/email).
  // If several jobs share a similar street score and none has a 2nd point, leave unmatched for picker.
  // If the email names a customer/addressee that does not agree with this job, reject address-only
  // (Levi 2026-08-26: NOT just any job that shares a similar address).
  if (bestMeta.points === 1 && bestMeta.addressOk && !bestMeta.identityOk && !bestMeta.documentOk) {
    const scored = list.map((j) => ({ j, meta: scoreJobVerification(insight, j) }));
    const rival = scored
      .filter((x) => x.j.id !== best.id && x.meta.points >= 2)
      .sort((a, b) => b.meta.score - a.meta.score)[0];
    if (rival) {
      best = rival.j;
      bestMeta = rival.meta;
    } else {
      const nearStreet = scored.filter(
        (x) =>
          x.meta.addressOk &&
          x.meta.addressScore >= bestMeta.addressScore - 0.12 &&
          !x.meta.identityOk &&
          !x.meta.documentOk
      );
      if (nearStreet.length > 1) {
        return {
          jobId: null,
          score: bestMeta.addressScore,
          job: null,
          points: 1,
          evidence: bestMeta.evidence,
          ambiguous: true,
        };
      }
      const nameHints = [
        ...(insight?.customerNameHints || []),
        insight?.customerNameHint,
        ...extractCustomerNameHints(insightMatchBlob(insight), insight?.source?.to || ""),
      ].filter(Boolean);
      // Office To: on a forward is not a customer addressee — only treat
      // non-office recipient emails / Dear/Customer name hints as identity signal.
      const customerToEmails = [
        ...extractEmailsFromText(insight?.source?.to || ""),
        ...(insight?.recipientEmails || []),
      ].filter((e) => e && !isOfficeOutboundEmail(e));
      const hasCustomerAddressee = nameHints.length > 0 || customerToEmails.length > 0;
      if (hasCustomerAddressee) {
        // Explicit customer addressee present but identity failed → picker / Change.
        return {
          jobId: null,
          score: bestMeta.addressScore,
          job: null,
          points: 1,
          evidence: bestMeta.evidence,
          identityConflict: true,
        };
      }
    }
  }

  return {
    jobId: best.id,
    score: Math.min(1, bestMeta.score),
    job: best,
    points: bestMeta.points,
    evidence: bestMeta.evidence,
  };
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
  // No date → never offer calendar (junk / incomplete parse — Levi 2026-07-22).
  // Acknowledgments are case-open only — never calendar (Levi 2026-08-03).
  // "other" alone used to schedule from letter "Date:" — too loose; require real set language via scheduled/rescheduled only.
  const isNewSet = outcome === "scheduled" || outcome === "rescheduled";
  const scheduleable = isNewSet && !past && !!when;

  if (scheduleable) {
    actions.push({
      key: "calendar",
      label: `Add ${typeLabel} to calendar (${when.replace("T", " ").slice(0, 16)})`,
      enabled: true,
      defaultOn: true,
    });

    if (type === "inspection" || type === "appointment" || type === "poe" || type === "meter_installation") {
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
      label: "Note cancelled — use Ignore and cancel to remove it from the calendar",
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
  } else if (outcome === "acknowledgment") {
    actions.push({
      key: "note_acknowledgment",
      label: "Case acknowledgment only — open Con Edison case (no calendar appointment)",
      enabled: true,
      defaultOn: true,
    });
  }

  // One invite toggle only (Levi 2026-08-26) — guest_customer was dead double-messaging.
  // Off until Approve checks it — no surprise customer email.
  if (job?.email && scheduleable) {
    const who = job.customer || job.businessName || "customer";
    actions.push({
      key: "guest_email",
      label: `Invite ${who} by email`,
      enabled: true,
      defaultOn: false,
      surface: true,
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

  // Location always applied on Approve — no separate checkbox (was dead/confusing).

  return actions;
}

export function formatInsightLead(insight, job) {
  const src = insight?.source?.fromLabel || "Email";
  const outcome = insight?.outcome || "other";
  const typeLabel = appointmentTypeLabel(insight?.appointmentType, insight?.agency);
  const when = insight?.dateTime
    ? formatInsightDateLabel(insight.dateTime) +
      (formatInsightTimeLabel(insight.dateTime) ? " · " + formatInsightTimeLabel(insight.dateTime) : "")
    : "";
  const where = insight?.address || "";
  const points = Number(insight?.matchPoints) || 0;
  const who = job?.customer || job?.businessName || "";

  if (outcome === "cancelled") {
    return who
      ? `${src}: cancelled ${typeLabel} for ${who}.`
      : `${src}: this appointment was cancelled.`;
  }
  if (outcome === "completed") {
    return who
      ? `${src}: ${typeLabel} completed for ${who} — paperwork updates on Approve.`
      : `${src}: ${typeLabel} completed.`;
  }
  if (outcome === "reminder") {
    return `${src}: reminder only — will not add a second calendar appointment.`;
  }
  if (outcome === "acknowledgment" || outcome === "todo_update") {
    return `${src}: case/to-do update only — no calendar appointment.`;
  }

  const bits = [`${src}: ${typeLabel}`];
  if (when) bits.push(when);
  if (where) bits.push(where);
  let line = bits.join(" · ");
  if (who) {
    line +=
      points >= 2
        ? `. Suggested: ${who} (${points}/3 checks) — Change if wrong.`
        : `. Suggested: ${who} — confirm or Change.`;
  } else {
    line += ". No customer match yet — Choose one.";
  }
  return line;
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
  if (outcome === "rescheduled") {
    const removed = Number(insight?.replacedEventCount || 0);
    const tail = removed
      ? ` and removed the ${removed === 1 ? "old appointment" : `${removed} old appointments`}`
      : " — no earlier appointment was on the calendar to remove";
    return when
      ? `From ${src}: moved ${type} for ${who} to ${when}${tail}.`
      : `From ${src}: rescheduled ${type} for ${who}${tail}.`;
  }
  // Never claim "added to calendar" for silence paths (Levi 2026-08-05 inquiry/to-do popups).
  if (outcome === "acknowledgment" || insight?.skipReason === "todo_or_ack_silent") {
    return `From ${src}: case update for ${who} filed quietly — no calendar change.`;
  }
  if (outcome === "todo_update") {
    return `From ${src}: to-do list for ${who} updated on the Permits tab — no calendar change.`;
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
 * Real-data quality gate (Levi 2026-07-22): only surface insights with concrete
 * facts — not vague / test / junk mail like subject "x" with no address or date.
 *
 * Requires:
 *  - Meaningful email content (not a stub)
 *  - At least one real anchor: address, DOB job #, or job match
 *  - Date/time for schedule / reminder / generic appointment sets
 */
export function hasRealInsightData(insight) {
  if (!insight) return false;

  const subject = String(insight.source?.subject || "").trim();
  const snippet = String(insight.emailSnippet || insight.source?.body || "").trim();
  const content = `${subject} ${snippet}`.replace(/\s+/g, " ").trim();

  // Empty or trivial body/subject — e.g. "x" / "Re: x" / "test".
  if (!content || content.length < 12) return false;
  const stubRe = /^(re:\s*)?(x+|test|asdf|foo|bar|hello|hi|n\/a|na|none|tbd)\s*$/i;
  if (stubRe.test(subject) && content.length < 48) return false;
  if (stubRe.test(snippet) && content.length < 48) return false;

  const address = String(insight.address || "").trim();
  const hasAddress = address.length >= 6 && /\d/.test(address);
  const hasDobJob = !!String(insight.dobJobNumber || "").trim();
  const hasJob =
    !!insight.jobId ||
    (Number(insight.jobMatchScore) || 0) >= 0.5 ||
    !!String(insight.matchedJobId || "").trim();
  const hasDate = !!String(insight.dateTime || insight.exactDateTime || "").trim();

  // Must pin to a place or a known job — "Energy Services appointment" alone is not enough.
  if (!hasAddress && !hasJob && !hasDobJob) return false;

  const outcome = insight.outcome || "other";
  // Acknowledgments: case open confirmation — address or MC# is enough; no appointment date required.
  if (outcome === "acknowledgment") {
    return hasAddress || hasJob || hasDobJob || /\bMC[-\s]?\d{5,8}\b/i.test(content);
  }
  // New sets / reschedules / reminders / generic "other" need a real when — otherwise calendar is empty.
  if (
    outcome === "scheduled" ||
    outcome === "rescheduled" ||
    outcome === "reminder" ||
    outcome === "other"
  ) {
    if (!hasDate) return false;
  }
  // completed / cancelled: address or job (already required) is enough for paperwork/note.
  return true;
}

/**
 * Whether the app should show any sheet for this insight (approve / done notice).
 * Past appointment reminders, late-arriving sets, and junk/vague emails are silent.
 */
export function shouldSurfaceInsight(insight, now = new Date()) {
  if (!insight) return false;
  if (!hasRealInsightData(insight)) return false;
  const from = insight.source?.from || "";
  const subject = insight.source?.subject || "";
  const body = insight.emailSnippet || insight.source?.body || "";
  // Office outbound / office conversation never opens the sheet (Levi 2026-08-05 bloat).
  if (isOfficeOutboundEmail(from)) return false;
  if (isOfficeConversationBody(body, subject)) return false;
  // Pure acknowledgments / To-Do list updates never open the appointment sheet
  // (Levi 2026-08-05: no popup every Energy Services email).
  const outcome = insight.outcome || "";
  if (outcome === "acknowledgment" || outcome === "todo_update") return false;
  // "other" = discussion / unclassifiable — never the Email understood sheet.
  // (Quoted originals still carry address+date; that is not a new set.)
  if (outcome === "other" || !outcome) return false;
  // Reply threads without a real City/Con Ed sender stay silent.
  if (/^(re|fw|fwd)\s*:/i.test(String(subject).trim()) && !isAgencySender(from)) return false;
  if (isPastAppointmentInsight(insight, now)) return false;
  return true;
}

/**
 * Silent auto-apply is ONLY for completed-inspection paperwork updates.
 * Levi 2026-07-22: never auto-create a calendar appointment — new sets always
 * wait for Approve (or Edit first). Reminders never create. Weak matches and
 * cancelled emails also stay on the approve sheet.
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
  // New appointment sets require Levi's Approve — no silent calendar create.
  if (outcome === "completed") return true;
  // Levi 2026-08-04: open Con Ed cases must auto-link to the matched job
  // (case number on paperwork) without waiting for Approve — no calendar.
  // To-Do list + ack + case status: silent paperwork link (no calendar, no popup).
  if (
    (insight.agency === "coned" || outcome === "acknowledgment" || outcome === "todo_update") &&
    (outcome === "acknowledgment" ||
      outcome === "todo_update" ||
      outcome === "other" ||
      /acknowledgment|status update|to-?do list|service layout|service date|inquiry\s+id|ci-\d+/i.test(
        insight?.source?.subject || insight?.summary || ""
      ))
  ) {
    // High-confidence address match only — never silent-link weak matches.
    return (insight.jobMatchScore || 0) >= AUTO_APPLY_MIN_SCORE;
  }
  return false;
}

/**
 * Whether this email should create a calendar event (new set only, not reminder).
 */
export function wantsNewCalendarAppointment(insight, now = new Date()) {
  const outcome = insight?.outcome || "other";
  if (
    outcome === "reminder" ||
    outcome === "cancelled" ||
    outcome === "completed" ||
    outcome === "acknowledgment" ||
    outcome === "todo_update" ||
    outcome === "other"
  ) {
    return false;
  }
  // Only true new sets / reschedules create calendar events (Levi 2026-08-03).
  if (outcome !== "scheduled" && outcome !== "rescheduled") return false;
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
  const blob = [subject, bodyText].filter(Boolean).join("\n");
  insight.outcome = classifyEmailOutcome(subject, bodyText, insight.source?.from || "");
  if (!insight.agency) {
    insight.agency = classifyAgency(
      insight.source?.from || "",
      subject,
      bodyText
    );
  }
  // Refresh window copy + re-classify type (3h → meter install) so old rows heal.
  if (!insight.timeWindow && blob) {
    const sched = resolveScheduleTimes(blob);
    if (sched.timeWindow) insight.timeWindow = sched.timeWindow;
    if (!insight.dateTime && sched.dateTime) {
      insight.dateTime = sched.dateTime;
      insight.endDateTime = sched.endDateTime;
      insight.exactDateTime = sched.exactDateTime;
    }
  } else if (insight.timeWindow && !insight.timeWindow.text?.includes("BTWN")) {
    insight.timeWindow = {
      ...insight.timeWindow,
      text: formatWindowBtwn(insight.timeWindow),
    };
  }
  const reType = classifyAppointmentType(blob, insight.timeWindow);
  if (reType === "meter_installation" || !insight.appointmentType || insight.appointmentType === "appointment" || insight.appointmentType === "other") {
    insight.appointmentType = reType;
  }
  // Drop the stale "(cancelled)" tag from older summaries after reclassify.
  if (insight.outcome !== "cancelled" && typeof insight.summary === "string") {
    insight.summary = insight.summary.replace(/\s*\(cancelled\)\s*$/i, "").trim();
  }
  // Levi may lock a customer/job on the Approve card — never rematch over it.
  let matchJob = null;
  if (insight.jobIdLocked && insight.jobId) {
    matchJob = (jobs || []).find((j) => String(j.id) === String(insight.jobId)) || null;
    const lockedMeta = matchJob ? scoreJobVerification(insight, matchJob) : null;
    insight.jobMatchScore = lockedMeta ? lockedMeta.score : insight.jobMatchScore || 1;
    insight.matchPoints = lockedMeta ? lockedMeta.points : insight.matchPoints || 0;
    insight.matchEvidence = lockedMeta ? lockedMeta.evidence : insight.matchEvidence || null;
  } else {
    const match = matchJobForInsight(insight, jobs);
    // Trust rematch — do not keep a stale wrong jobId when matcher abstains
    // (ambiguous street / identity conflict). Levi can still Change on the card.
    insight.jobId = match.jobId || null;
    insight.jobMatchScore = match.score || 0;
    insight.matchPoints = match.points || 0;
    insight.matchEvidence = match.evidence || null;
    matchJob = match.job;
  }
  if (!matchJob && insight.jobId) {
    matchJob = (jobs || []).find((j) => String(j.id) === String(insight.jobId)) || null;
  }
  insight.proposedActions = buildProposedActions(insight, matchJob);
  insight.lead = formatInsightLead(insight, matchJob);
  insight.appliedLead = formatAppliedLead(insight, matchJob);
  insight.canAutoApply = canAutoApply(insight, matchJob);
  return insight;
}

export function paperworkPatchForInsight(insight, dateTime) {
  const dt = dateTime || insight?.dateTime || "";
  if (!dt) return {};
  const type = insight?.appointmentType;
  const agency = insight?.agency || "";
  const subject = insight?.source?.subject || "";
  const snippet = insight?.emailSnippet || insight?.summary || "";
  const blob = `${subject}\n${snippet}`.toLowerCase();
  const isFinal =
    /\bfinal\s+inspection\b/.test(blob) ||
    (type === "inspection" && /\bfinal\b/.test(blob));
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
    // Levi 2026-07-23: when final inspection date is confirmed, Final checklist is done.
    const steps = isFinal ? { "Final checklist": true } : {};
    return {
      paperwork: {
        coned: {
          enabled: true,
          dates: { "Inspection appointment": dt },
          ...(Object.keys(steps).length ? { steps } : {}),
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
