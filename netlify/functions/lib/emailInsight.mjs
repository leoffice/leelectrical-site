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

const ENERGY_SENDER_RE =
  /energy\s*services|con\s*edison|coned|@coned\.com|@conedison\.com|@energy-services/i;

const STREET_RE =
  /\d+\s+[\w\s.'-]+(?:\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place)\b)[^,;\n]*/i;

const DATE_TIME_RE =
  /(?:on\s+)?(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)[\s,]+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

const DATE_ONLY_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/;

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export function isEnergyServicesEmail(from, subject = "", body = "") {
  const blob = [from, subject, body].join(" ");
  return ENERGY_SENDER_RE.test(blob);
}

export function extractAddress(text) {
  const m = String(text || "").match(STREET_RE);
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

export function extractDateTime(text, refYear = new Date().getFullYear()) {
  const s = String(text || "");
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
  const s = String(text || "").toLowerCase();
  if (/meter\s*(?:install|replacement|set)/.test(s)) return "meter_installation";
  if (/poe|point\s*of\s*entry/.test(s)) return "poe";
  if (/inspection|inspect/.test(s)) return "inspection";
  if (/appointment|scheduled|schedule/.test(s)) return "appointment";
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
  const blob = [subject, body].filter(Boolean).join("\n");
  const address = extractAddress(blob);
  const dateTime = extractDateTime(blob);
  const appointmentType = classifyAppointmentType(blob);
  const fromLabel = /energy\s*services/i.test(from) ? "Energy Services" : /con\s*ed/i.test(from) ? "Con Edison" : "Email";

  const summaryParts = [];
  if (address) summaryParts.push(`at ${address}`);
  if (dateTime) summaryParts.push(`on ${dateTime.replace("T", " ").slice(0, 16)}`);
  summaryParts.push(`for ${appointmentTypeLabel(appointmentType)}`);

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
    address,
    dateTime,
    summary: summaryParts.join(" "),
    emailSnippet: String(body || subject || "").slice(0, 400).trim(),
    jobId: null,
    jobMatchScore: 0,
    proposedActions: [],
  };
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
  const actions = [];
  const when = insight?.dateTime || "";
  const addr = insight?.address || job?.serviceAddress || job?.address || "";

  actions.push({
    key: "calendar",
    label: when
      ? `Add ${appointmentTypeLabel(type)} to calendar (${when.replace("T", " ").slice(0, 16)})`
      : `Add ${appointmentTypeLabel(type)} to calendar`,
    enabled: true,
    defaultOn: true,
  });

  if (type === "inspection" || type === "appointment") {
    actions.push({ key: "remind_1d", label: "Reminder 1 day before", enabled: true, defaultOn: true });
    actions.push({ key: "remind_1h", label: "Reminder 1 hour before", enabled: true, defaultOn: true });
  }

  if (job?.customer) {
    actions.push({
      key: "guest_customer",
      label: `Add ${job.customer} to the event`,
      enabled: true,
      defaultOn: true,
    });
  }
  if (job?.email) {
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
      label: "Update Con Ed paperwork — Inspection appointment",
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
  } else if (job?.id) {
    actions.push({
      key: "paperwork_progress",
      label: "Update task progress on the job",
      enabled: true,
      defaultOn: true,
    });
  }

  if (addr) {
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
  const jobLine = job
    ? `I'm going to add this to the existing job for ${job.customer || "this customer"}.`
    : insight?.address
      ? `I found an address (${insight.address}) but no matching job yet.`
      : "I couldn't match this to a job address yet.";
  const appt = insight?.summary || appointmentTypeLabel(insight?.appointmentType);
  return `From ${src}: ${appt}. ${jobLine}`;
}

export function enrichInsight(raw, jobs) {
  const insight = { ...raw };
  const match = matchJobForInsight(insight, jobs);
  insight.jobId = match.jobId;
  insight.jobMatchScore = match.score;
  insight.proposedActions = buildProposedActions(insight, match.job);
  insight.lead = formatInsightLead(insight, match.job);
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