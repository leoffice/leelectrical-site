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

/** Calendar event length for email-driven appointments — always 30 minutes. */
export const APPOINTMENT_DURATION_MINUTES = 30;

export function isEnergyServicesEmail(from, subject = "", body = "") {
  const blob = [from, subject, body].join(" ");
  return ENERGY_SENDER_RE.test(blob);
}

export function extractAddress(text) {
  const plain = stripHtml(text);
  // Prefer "Service Address" block from Con Ed HTML mail.
  const svc = plain.match(/service\s*address\s+([^\n]+?)(?:\s+brooklyn|\s+ny\b|\s+case\s*number|$)/i);
  if (svc) {
    const candidate = svc[1].replace(/\s+/g, " ").trim();
    if (/\d/.test(candidate) && candidate.length >= 6) return candidate;
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
 * - Window → start of window, 30 min duration; description carries the full window.
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
  if (/final\s*inspection|initial\s*inspection|inspection|inspect/.test(s)) return "inspection";
  if (/appointment|scheduled|schedule|reminder/.test(s)) return "appointment";
  return "other";
}

/**
 * Outcome of the email — drives auto-calendar vs paperwork-only vs skip.
 * scheduled | reminder | cancelled | completed | other
 */
export function classifyEmailOutcome(subject = "", body = "") {
  const s = stripHtml([subject, body].join("\n")).toLowerCase();
  // Do NOT treat "Reschedule the appointment" (Con Ed footer link) as cancelled.
  if (
    /\b(appointment\s+)?cancell?ed\b/.test(s) ||
    /\bcancellation\b/.test(s) ||
    /\bcancelled by\b/.test(s)
  ) {
    return "cancelled";
  }
  if (/\bcompleted\b|\bpassed\b|\bpassed on\b|\binspection\s+passed\b/.test(s)) return "completed";
  if (/\breminder\b|\bupcoming\b/.test(s)) return "reminder";
  if (/\bscheduled\b|\bappointment is set\b|\bhas been scheduled\b/.test(s)) return "scheduled";
  if (/\bappointment\b/.test(s)) return "scheduled";
  return "other";
}

const TYPE_LABELS = {
  inspection: "Con Edison inspection",
  meter_installation: "meter installation",
  poe: "POE appointment",
  appointment: "appointment",
  other: "Energy Services appointment",
};

export function appointmentTypeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.other;
}

export function parseEmailInsight({ from = "", subject = "", body = "", receivedAt = "", messageId = "" }) {
  const plainBody = stripHtml(body);
  const blob = [subject, plainBody].filter(Boolean).join("\n");
  const address = extractAddress(blob);
  const schedule = resolveScheduleTimes(blob);
  const dateTime = schedule.dateTime;
  const appointmentType = classifyAppointmentType(blob);
  const outcome = classifyEmailOutcome(subject, plainBody);
  const fromLabel = /energy\s*services/i.test(from)
    ? "Energy Services"
    : /con\s*ed|@coned\.com|cpms\.noreply/i.test(from)
      ? "Con Edison"
      : "Email";

  const summaryParts = [];
  if (address) summaryParts.push(`at ${address}`);
  if (dateTime) summaryParts.push(`on ${dateTime.replace("T", " ").slice(0, 16)}`);
  if (schedule.timeWindow) summaryParts.push(`(${schedule.timeWindow.text.replace(/\.$/, "")})`);
  summaryParts.push(`for ${appointmentTypeLabel(appointmentType)}`);
  if (outcome === "cancelled") summaryParts.push("(cancelled)");
  if (outcome === "completed") summaryParts.push("(completed)");

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
    appointmentType,
    outcome,
    address,
    dateTime,
    exactDateTime: schedule.exactDateTime || "",
    endDateTime: schedule.endDateTime || "",
    timeWindow: schedule.timeWindow || null,
    summary: summaryParts.join(" "),
    emailSnippet: plainBody.slice(0, 400).trim() || String(subject || "").slice(0, 200),
    jobId: null,
    jobMatchScore: 0,
    proposedActions: [],
  };
}

/**
 * Plain-language description for the Google Calendar event.
 * Includes appointment window and (for inspections) exact time vs half-hour slot.
 */
export function buildAppointmentDescription(insight, job) {
  const lines = [];
  const type = insight?.appointmentType || "other";
  const window = insight?.timeWindow;
  const exact = insight?.exactDateTime || "";
  const scheduled = insight?.dateTime || "";

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
        `Con Edison inspection at ${exactLabel}. Scheduled for ${schedLabel} because we only use half-hour increments.`
      );
    } else {
      lines.push(`Con Edison inspection at ${exactLabel}.`);
    }
  } else if (type === "inspection" && scheduled) {
    const schedLabel = formatClockLabel(
      parseInt(scheduled.slice(11, 13), 10),
      parseInt(scheduled.slice(14, 16), 10),
      true
    );
    lines.push(`Con Edison inspection at ${schedLabel}.`);
  }

  lines.push("From Energy Services email");
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

export function buildProposedActions(insight, job) {
  const type = insight?.appointmentType || "other";
  const outcome = insight?.outcome || "other";
  const actions = [];
  const when = insight?.dateTime || "";
  const addr = insight?.address || job?.serviceAddress || job?.address || "";

  const scheduleable = outcome !== "cancelled" && outcome !== "completed";

  if (scheduleable) {
    actions.push({
      key: "calendar",
      label: when
        ? `Add ${appointmentTypeLabel(type)} to calendar (${when.replace("T", " ").slice(0, 16)})`
        : `Add ${appointmentTypeLabel(type)} to calendar`,
      enabled: true,
      defaultOn: true,
    });

    if (type === "inspection" || type === "appointment" || type === "poe") {
      actions.push({ key: "remind_1d", label: "Reminder 1 day before", enabled: true, defaultOn: true });
      actions.push({ key: "remind_1h", label: "Reminder 1 hour before", enabled: true, defaultOn: true });
    }
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
    actions.push({
      key: "paperwork_inspection",
      label:
        outcome === "completed"
          ? "Update Con Ed paperwork — inspection completed"
          : "Update Con Ed paperwork — Inspection appointment",
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
  }
  const appt = insight?.summary || appointmentTypeLabel(insight?.appointmentType);
  return `From ${src}: ${appt}. ${jobLine}`;
}

export function formatAppliedLead(insight, job) {
  const src = insight?.source?.fromLabel || "Email";
  const type = appointmentTypeLabel(insight?.appointmentType);
  const when = insight?.dateTime ? insight.dateTime.replace("T", " ").slice(0, 16) : "";
  const who = job?.customer || "the job";
  const outcome = insight?.outcome || "other";
  if (outcome === "completed") {
    return `From ${src}: marked ${type} completed for ${who}${when ? ` (${when})` : ""}. Already on the job.`;
  }
  if (outcome === "cancelled") {
    return `From ${src}: noted cancelled ${type} for ${who}. Nothing added to the calendar.`;
  }
  return when
    ? `From ${src}: added ${type} for ${who} to your schedule calendar on ${when}.`
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
 * Silent auto-apply when we have a strong job match and a clear scheduleable email.
 * Weak matches still need Levi's approve sheet.
 */
export function canAutoApply(insight, job, now = new Date()) {
  if (!insight || !job?.id) return false;
  if ((insight.jobMatchScore || 0) < AUTO_APPLY_MIN_SCORE) return false;
  const outcome = insight.outcome || "other";
  if (outcome === "cancelled") return false;
  // Completed inspections: auto-update paperwork only (still notify).
  if (outcome === "completed") return true;
  // Need a date/time on the calendar, and not a stale past appointment.
  if (!insight.dateTime || !isDateTimeActionable(insight.dateTime, now)) return false;
  return outcome === "scheduled" || outcome === "reminder" || outcome === "other" || outcome === "appointment";
}

export function defaultActionKeys(insight, job) {
  const actions = insight?.proposedActions?.length
    ? insight.proposedActions
    : buildProposedActions(insight, job);
  return actions.filter((a) => a.defaultOn !== false && a.enabled !== false).map((a) => a.key);
}

export function enrichInsight(raw, jobs) {
  const insight = { ...raw };
  if (!insight.outcome) {
    insight.outcome = classifyEmailOutcome(insight.source?.subject || "", insight.emailSnippet || "");
  }
  const match = matchJobForInsight(insight, jobs);
  insight.jobId = match.jobId;
  insight.jobMatchScore = match.score;
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
  if (type === "inspection") {
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
