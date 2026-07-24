/**
 * NYC DOB NOW: Electrical open-case tracker (WP-Permits-B brain).
 *
 * The City sibling of conedPermit.js. Pure functions only — no network.
 * Email → event type → stage → job patch, producing an `agency:"city"` permit
 * record the permits board renders next to the Con Ed cases.
 *
 * Grounded in the DOB NOW: Electrical notification flow (sender
 * dobnowdonotreply@buildings.nyc.gov) + the server parser primitives in
 * netlify/functions/lib/emailInsight.mjs (extractDobJobNumber / CITY_DOB_SENDER_RE).
 * NOTE: live sample volume is thin (DOB mail often lands under a Gmail label,
 * not the Inbox) — unknown subjects intentionally do NOT move the stage, same
 * conservative default as the Con Ed brain.
 */

/** Canonical DOB NOW: Electrical stages, filing → sign-off. */
export const CITY_STAGES = [
  "filing_submitted",
  "under_review",
  "objections",
  "permit_issued",
  "inspection_scheduled",
  "inspection_passed",
  "inspection_failed",
  "signed_off",
  "cancelled",
];

export const CITY_STAGE_LABELS = {
  filing_submitted: "Filing submitted",
  under_review: "Under review",
  objections: "Objections — response due",
  permit_issued: "Permit issued",
  inspection_scheduled: "Inspection scheduled",
  inspection_passed: "Inspection passed",
  inspection_failed: "Inspection failed — rework",
  signed_off: "Signed off / LOC",
  cancelled: "Cancelled / withdrawn",
};

/** Roll-up buckets — shared vocabulary with conedPermit's STAGE_BUCKET. */
export const CITY_STAGE_BUCKET = {
  filing_submitted: "Open",
  under_review: "Open",
  objections: "Waiting-on-us",
  permit_issued: "Open",
  inspection_scheduled: "Scheduled",
  inspection_passed: "Passed",
  inspection_failed: "Waiting-on-us",
  signed_off: "Terminal",
  cancelled: "Terminal",
};

/** Health for the action-needed strip. */
export function cityStageHealth(stage) {
  if (!stage) return "ok";
  if (stage === "objections" || stage === "inspection_failed") return "blocked-by-us";
  return "ok";
}

/** Higher rank wins on merge; terminal states are sticky. */
const CITY_STAGE_RANK = {
  filing_submitted: 10,
  under_review: 20,
  objections: 25,
  permit_issued: 40,
  inspection_scheduled: 60,
  inspection_failed: 55, // back toward rework
  inspection_passed: 90,
  signed_off: 100,
  cancelled: 200,
};

/** DOB NOW job number: M01228312, B01334914I1EL, M01228312/I1. */
export function extractDobNumber(text = "") {
  const s = String(text || "");
  const m =
    s.match(/\b([MBQRK]\d{7,9}(?:[/-]?I\d+)?(?:EL)?)\b/i) ||
    s.match(/\bJob\s*(?:Number|No\.?|#)\s*[:#]?\s*([MBQRK]\d{6,})\b/i);
  return m ? m[1].toUpperCase() : "";
}

/** Classify a DOB NOW: Electrical email into an event type. */
export function classifyCityMessageType(subject = "", body = "") {
  const subj = String(subject || "");
  const plain = String(body || "").replace(/<[^>]+>/g, " ");
  const s = `${subj}\n${plain}`.toLowerCase();

  // Inspection outcomes first (most specific).
  if (/electrical\s+inspection\s+scheduled|inspection\s+scheduled/.test(s)) {
    return "city.inspection_scheduled";
  }
  if (/inspection\s+(results?|report)/.test(s) || /inspection\s+(passed|approved|satisfactory)/.test(s)) {
    if (/\b(fail|failed|disapprov|defect|unsatisfactory|not\s+approved)/.test(s)) return "city.inspection_failed";
    if (/\b(pass|passed|approv|satisfactory)/.test(s)) return "city.inspection_passed";
    return "city.inspection_result";
  }
  if (/inspection\s+(cancell?ed|rescheduled)/.test(s)) return "city.inspection_reschedule";

  // Sign-off / completion.
  if (/letter\s+of\s+completion|\bloc\b|signed?\s*-?\s*off|final\s+sign\s*off/.test(s)) {
    return "city.signed_off";
  }

  // Permit issuance.
  if (/permit\s+(issued|granted|approved)|work\s+permit\s+issued/.test(s)) return "city.permit_issued";

  // Plan-exam objections / disapproval (waiting on us).
  if (/objection|disapprov|deficienc|resubmit|additional\s+information\s+required/.test(s)) {
    return "city.objections";
  }
  if (/(under|in)\s+review|plan\s+exam|assigned\s+to\s+plan/.test(s)) return "city.under_review";

  // Filing lifecycle.
  if (/cancell?ed|withdrawn|superseded/.test(s)) return "city.cancelled";
  if (/filing\s+(submitted|received|created)|application\s+(submitted|received)|job\s+number\s+.*created/.test(s)) {
    return "city.filing_submitted";
  }

  return "city.other";
}

/** Map event type → target stage (null = no move). */
export function stageForCityEvent(eventType) {
  switch (eventType) {
    case "city.filing_submitted":
      return "filing_submitted";
    case "city.under_review":
      return "under_review";
    case "city.objections":
      return "objections";
    case "city.permit_issued":
      return "permit_issued";
    case "city.inspection_scheduled":
      return "inspection_scheduled";
    case "city.inspection_passed":
      return "inspection_passed";
    case "city.inspection_failed":
      return "inspection_failed";
    case "city.signed_off":
      return "signed_off";
    case "city.cancelled":
      return "cancelled";
    default:
      return null;
  }
}

/** Prefer higher-rank stage; cancelled always wins; fail can drop from scheduled. */
export function mergeCityStage(current, incoming) {
  if (!incoming) return current || "";
  if (!current) return incoming;
  if (incoming === "cancelled" || current === "cancelled") return "cancelled";
  if (incoming === "inspection_failed" && current === "inspection_scheduled") return "inspection_failed";
  const cr = CITY_STAGE_RANK[current] ?? 0;
  const ir = CITY_STAGE_RANK[incoming] ?? 0;
  return ir >= cr ? incoming : current;
}

export function nextActionForCityStage(stage, dateTime = "") {
  const label = CITY_STAGE_LABELS[stage] || "Open filing";
  switch (stage) {
    case "objections":
      return { label: "DOB objections — respond / resubmit", date: "" };
    case "inspection_failed":
      return { label: "Inspection failed — correct + re-request", date: "" };
    case "inspection_scheduled":
      return {
        label: dateTime ? `Inspection ${dateTime.replace("T", " ").slice(0, 16)}` : label,
        date: dateTime || "",
      };
    case "permit_issued":
      return { label: "Permit issued — schedule inspection", date: "" };
    case "inspection_passed":
      return { label: "Passed — request sign-off / LOC", date: dateTime || "" };
    case "signed_off":
      return { label: "Signed off — closeout eligible", date: "" };
    default:
      return { label, date: dateTime || "" };
  }
}

/** True when an insight is a City / DOB NOW email. */
export function isCityAgencyInsight(insight) {
  if (!insight) return false;
  if (insight.agency === "city" || insight.agency === "dob") return true;
  const from = insight?.source?.from || "";
  const subj = insight?.source?.subject || "";
  return /buildings\.nyc\.gov|dobnow|department\s+of\s+buildings|nyc\s+dob|electrical\s+inspection\s+scheduled/i.test(
    `${from} ${subj}`
  );
}

/** Build a City permit record from a classified DOB email / insight. */
export function buildCityPermitFromEmail({
  subject = "",
  body = "",
  from = "",
  messageId = "",
  address = "",
  dateTime = "",
  jobId = "",
  existing = null,
  receivedAt = "",
  dobJobNumber = "",
} = {}) {
  const eventType = classifyCityMessageType(subject, body);
  const key = dobJobNumber || extractDobNumber(`${subject}\n${body}`) || existing?.primaryKey || "";
  const targetStage = stageForCityEvent(eventType);
  const currentStage = mergeCityStage(existing?.currentStage, targetStage);
  const bucket = CITY_STAGE_BUCKET[currentStage] || "Open";
  const health = cityStageHealth(currentStage);
  const now = receivedAt || new Date().toISOString();
  const event = {
    eventType,
    rawSourceRef: messageId || "",
    from: String(from || "").trim(),
    subject: String(subject || "").trim(),
    parsedFields: { dateTime: dateTime || "", address: address || "", dob: key },
    createdAt: now,
  };
  const events = [...(existing?.events || []), event].slice(-40);
  const nextAction = nextActionForCityStage(currentStage, dateTime);
  return {
    id: existing?.id || (key ? `permit-city-${key.replace(/[^a-z0-9]/gi, "")}` : `permit-city-${messageId || now}`),
    jobId: jobId || existing?.jobId || "",
    agency: "city",
    primaryKey: key,
    addressNormalized: address || existing?.addressNormalized || "",
    currentStage,
    stageBucket: bucket,
    health,
    nextAction: nextAction.label,
    nextActionDate: nextAction.date || dateTime || existing?.nextActionDate || "",
    source: "email",
    blocksCloseout: ["Waiting-on-us", "Scheduled", "Open"].includes(bucket),
    events,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  };
}

/** Merge a City permit into a list (replace same agency+key). */
export function mergeCityPermitList(existingList = [], permit) {
  if (!permit) return existingList || [];
  const list = Array.isArray(existingList) ? [...existingList] : [];
  const key = permit.primaryKey || permit.id;
  const idx = list.findIndex(
    (p) => p && (p.agency === "city" || p.agency === "dob") && ((key && (p.primaryKey === key || p.id === key)) || p.id === permit.id)
  );
  if (idx >= 0) {
    const prev = list[idx];
    const merged = mergeCityStage(prev.currentStage, permit.currentStage);
    list[idx] = {
      ...prev,
      ...permit,
      events: permit.events || prev.events,
      currentStage: merged,
      stageBucket: CITY_STAGE_BUCKET[merged] || permit.stageBucket,
      health: cityStageHealth(merged),
    };
  } else {
    list.push(permit);
  }
  return list;
}

/** Full pipeline: insight → city permit + merged permits list. */
export function cityPatchFromInsight(insight, job = null) {
  if (!isCityAgencyInsight(insight)) return null;
  const existingList = job?.permits || [];
  const key =
    insight?.dobJobNumber ||
    extractDobNumber(`${insight?.source?.subject || ""}\n${insight?.emailSnippet || ""}\n${insight?.summary || ""}`) ||
    "";
  const existing =
    existingList.find((p) => (p.agency === "city" || p.agency === "dob") && (p.primaryKey === key || (!key && p.jobId === job?.id))) ||
    existingList.find((p) => p.agency === "city" || p.agency === "dob") ||
    null;

  const permit = buildCityPermitFromEmail({
    subject: insight?.source?.subject || "",
    body: insight?.emailSnippet || insight?.summary || "",
    from: insight?.source?.from || "",
    messageId: insight?.source?.messageId || insight?.id || "",
    address: insight?.address || job?.serviceAddress || job?.address || "",
    dateTime: insight?.dateTime || "",
    jobId: job?.id || insight?.jobId || "",
    existing,
    receivedAt: insight?.source?.receivedAt || "",
    dobJobNumber: key,
  });

  return {
    permit,
    permits: mergeCityPermitList(existingList, permit),
  };
}
