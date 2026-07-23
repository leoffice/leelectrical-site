/**
 * Con Edison open-case tracker (Batch 1 brain).
 * Grounded in PERMIT_LIFECYCLE_RESEARCH.md + LEPRO_APPLICATIONS_TAB_SPEC.md.
 *
 * Pure functions only — no network. Email → event type → stage → job patch.
 */

/** Canonical ConEd stages (spec §2.2 pills). */
export const CONED_STAGES = [
  "application_filed",
  "docs_pending",
  "survey_service_date",
  "layout_issued",
  "awaiting_initial_visit",
  "initial_inspection",
  "deposit_due",
  "final_checklist_wait",
  "ready_for_final",
  "final_inspection",
  "passed_complete",
  "meter_turn_on",
  "failed_rework",
  "no_show_reschedule",
  "at_risk",
  "cancelled",
  "field_crew",
];

/** Human labels for UI. */
export const CONED_STAGE_LABELS = {
  application_filed: "Application filed",
  docs_pending: "Docs pending",
  survey_service_date: "Survey / service date",
  layout_issued: "Layout issued",
  awaiting_initial_visit: "Awaiting initial visit",
  initial_inspection: "Initial inspection",
  deposit_due: "Deposit due",
  final_checklist_wait: "Final checklist wait",
  ready_for_final: "Ready for final",
  final_inspection: "Final inspection",
  passed_complete: "Passed / complete",
  meter_turn_on: "Meter / turn-on",
  failed_rework: "Failed — rework",
  no_show_reschedule: "No show / reschedule",
  at_risk: "At risk",
  cancelled: "Cancelled",
  field_crew: "Field crew visit",
};

/** Roll-up buckets for action-needed strip + job badges. */
export const STAGE_BUCKET = {
  application_filed: "Open",
  docs_pending: "Waiting-on-us",
  survey_service_date: "Open",
  layout_issued: "Open",
  awaiting_initial_visit: "Open",
  initial_inspection: "Scheduled",
  deposit_due: "Waiting-on-us",
  final_checklist_wait: "Waiting-on-us",
  ready_for_final: "Open",
  final_inspection: "Scheduled",
  passed_complete: "Passed",
  meter_turn_on: "Terminal",
  failed_rework: "Waiting-on-us",
  no_show_reschedule: "Open",
  at_risk: "At-risk",
  cancelled: "Terminal",
  field_crew: "Scheduled",
};

/** Health for sort / strip. */
export function stageHealth(stage) {
  if (!stage) return "ok";
  if (stage === "at_risk") return "at-risk";
  if (["docs_pending", "deposit_due", "final_checklist_wait", "failed_rework"].includes(stage)) {
    return "blocked-by-us";
  }
  if (stage === "cancelled") return "blocked-by-us";
  return "ok";
}

/** Forward-only stage rank so noisy re-parses don't regress. */
const STAGE_RANK = {
  application_filed: 10,
  docs_pending: 20,
  survey_service_date: 30,
  layout_issued: 40,
  awaiting_initial_visit: 50,
  initial_inspection: 60,
  deposit_due: 55, // money gate can interleave; keep near mid
  final_checklist_wait: 70,
  ready_for_final: 80,
  final_inspection: 90,
  passed_complete: 100,
  meter_turn_on: 110,
  failed_rework: 75, // back toward checklist
  no_show_reschedule: 65,
  at_risk: 72,
  cancelled: 200,
  field_crew: 85,
};

export function extractMcNumber(text = "") {
  const s = String(text || "");
  const m =
    s.match(/\bMC[-\s]?(\d{5,8})\b/i) ||
    s.match(/\bCase\s*Number\s*[:#]?\s*MC[-\s]?(\d{5,8})\b/i) ||
    s.match(/\bMaster\s*Case\s*[:#]?\s*MC[-\s]?(\d{5,8})\b/i);
  return m ? `MC-${m[1]}` : "";
}

/**
 * Classify ConEd Project Center / Appointments email into a message type.
 * Returns event_type string used on PermitEvent.
 */
export function classifyConedMessageType(subject = "", body = "") {
  const subj = String(subject || "");
  const plain = String(body || "").replace(/<[^>]+>/g, " ");
  const s = `${subj}\n${plain}`.toLowerCase();
  const subjL = subj.toLowerCase();

  // Deposit — subject often has NO "Con Edison" prefix.
  if (/deposit\s+payment\s+required/i.test(subj) || /deposit\s+payment\s+required/.test(s)) {
    return "coned.deposit_required";
  }

  // Appointments@coned.com field crew (APPT-).
  if (/\bappt-\d+/i.test(s) || /your\s+con\s*edison\s+appointment/i.test(subjL)) {
    if (/\bcompleted\b/.test(s)) return "coned.field_crew_completed";
    return "coned.field_crew_scheduled";
  }

  if (/acknowledgment\s+letter/i.test(subj) || /we have received your request/.test(s)) {
    return "coned.acknowledgment";
  }
  if (/status\s+update.*to-?do|customer\s+to-?do\s+list/i.test(s)) {
    return "coned.todo_list";
  }
  if (/service\s+date\s+confirmation/i.test(s)) return "coned.service_date";
  if (/service\s+layout|customer.?s\s+service\s+layout|2-80/i.test(s)) {
    return "coned.service_layout";
  }
  if (/perform\s+initial\s+field\s+visit|determine\s+poe\s+available/i.test(s)) {
    return "coned.initial_visit_available";
  }
  if (/perform\s+final\s+inspection\s+available/i.test(s)) {
    return "coned.final_available";
  }

  // Case inactivity ladder.
  if (/case\s+inactivity|inactivity\s+reminder|case will remain open/i.test(s)) {
    if (/remain\s+open/i.test(s)) return "coned.inactivity_confirmed_open";
    return "coned.case_inactivity";
  }
  if (/cancellation\s+notification|case\s+cancellation/i.test(s)) {
    return "coned.cancelled";
  }

  // Fail / no-show / scope (before generic completed).
  if (/failed\s+final\s+inspection/i.test(s)) return "coned.final_failed";
  if (/no\s*show/i.test(s) && /inspection|appointment/.test(s)) return "coned.no_show";
  if (/reschedule\s+pending|rescheduled/i.test(s) && /inspection|appointment/.test(s)) {
    return "coned.reschedule";
  }
  if (/scope\s+change/i.test(s)) return "coned.scope_change";

  // Final vs initial inspection — order matters.
  const isFinal = /\bfinal\s+inspection\b/.test(s);
  const isInitial = /\binitial\s+inspection\b/.test(s);
  if (isFinal) {
    if (/\bpassed\s+on\b|\bfinal\s+inspection\s+passed\b/.test(s)) return "coned.final_passed";
    if (/\bcompleted\b/.test(s) && /\bpassed\b/.test(s)) return "coned.final_passed";
    if (/\breminder\b|\bfriendly reminder\b|\bupcoming\b/.test(s)) return "coned.final_reminder";
    if (/\bscheduled\b/.test(s)) return "coned.final_scheduled";
    if (/\bcompleted\b/.test(s)) return "coned.final_completed_ambiguous";
  }
  if (isInitial) {
    if (/\breminder\b|\bfriendly reminder\b|\bupcoming\b/.test(s)) return "coned.initial_reminder";
    if (/\bscheduled\b/.test(s)) return "coned.initial_scheduled";
    // "completed" on initial ≠ passed
    if (/\bcompleted\b/.test(s)) return "coned.initial_completed";
  }

  // Generic inspection without initial/final tag.
  if (/\binspection\b/.test(s)) {
    if (/\bpassed\b/.test(s)) return "coned.final_passed";
    if (/\breminder\b/.test(s)) return "coned.inspection_reminder";
    if (/\bscheduled\b/.test(s)) return "coned.inspection_scheduled";
  }

  return "coned.other";
}

/** Map event type → target stage (null = no stage move). */
export function stageForConedEvent(eventType) {
  switch (eventType) {
    case "coned.acknowledgment":
      return "application_filed";
    case "coned.todo_list":
      return "docs_pending";
    case "coned.service_date":
      return "survey_service_date";
    case "coned.service_layout":
      return "layout_issued";
    case "coned.initial_visit_available":
      return "awaiting_initial_visit";
    case "coned.initial_scheduled":
    case "coned.initial_reminder":
      return "initial_inspection";
    case "coned.initial_completed":
      return "final_checklist_wait";
    case "coned.deposit_required":
      return "deposit_due";
    case "coned.final_available":
      return "ready_for_final";
    case "coned.final_scheduled":
    case "coned.final_reminder":
    case "coned.inspection_scheduled":
    case "coned.inspection_reminder":
      return "final_inspection";
    case "coned.final_passed":
    case "coned.final_completed_ambiguous":
      return "passed_complete";
    case "coned.final_failed":
      return "failed_rework";
    case "coned.no_show":
    case "coned.reschedule":
    case "coned.scope_change":
      return "no_show_reschedule";
    case "coned.case_inactivity":
      return "at_risk";
    case "coned.inactivity_confirmed_open":
      return null; // stays at prior stage, clears death clock later
    case "coned.cancelled":
      return "cancelled";
    case "coned.field_crew_scheduled":
    case "coned.field_crew_completed":
      return "field_crew";
    default:
      return null;
  }
}

/**
 * Levi 2026-07-23: Final checklist is done once an inspection date is confirmed
 * (final available / final scheduled / final inspection date on the job).
 * Manual mark-done still works; this is the automatic path.
 */
export function shouldMarkFinalChecklistDone(eventType, stage) {
  if (
    eventType === "coned.final_available" ||
    eventType === "coned.final_scheduled" ||
    eventType === "coned.final_reminder" ||
    eventType === "coned.final_passed" ||
    eventType === "coned.final_completed_ambiguous"
  ) {
    return true;
  }
  if (stage === "ready_for_final" || stage === "final_inspection" || stage === "passed_complete") {
    return true;
  }
  return false;
}

/** Prefer higher-rank stage; terminal cancelled always wins; failed can drop from final. */
export function mergeConedStage(current, incoming) {
  if (!incoming) return current || "";
  if (!current) return incoming;
  if (incoming === "cancelled") return "cancelled";
  if (current === "cancelled") return "cancelled";
  if (incoming === "failed_rework" && (current === "final_inspection" || current === "passed_complete")) {
    return "failed_rework";
  }
  const cr = STAGE_RANK[current] ?? 0;
  const ir = STAGE_RANK[incoming] ?? 0;
  return ir >= cr ? incoming : current;
}

/**
 * Paperwork steps to mark complete when we reach a stage (forward fill).
 * Existing dashboard step names — do not rename.
 */
export function paperworkStepsForStage(stage) {
  const steps = {};
  const mark = (...names) => {
    for (const n of names) steps[n] = true;
  };
  // Progressive unlocks
  if (!stage) return steps;
  const order = [
    "application_filed",
    "docs_pending",
    "survey_service_date",
    "layout_issued",
    "awaiting_initial_visit",
    "initial_inspection",
    "deposit_due",
    "final_checklist_wait",
    "ready_for_final",
    "final_inspection",
    "passed_complete",
  ];
  const idx = order.indexOf(stage);
  const atLeast = (s) => {
    const i = order.indexOf(s);
    return idx >= 0 && i >= 0 && idx >= i;
  };

  if (atLeast("application_filed")) mark("Application submitted");
  // POE / layout region
  if (atLeast("awaiting_initial_visit") || atLeast("layout_issued")) {
    mark("POE scheduled");
  }
  if (atLeast("layout_issued") || atLeast("initial_inspection")) {
    mark("Uploaded paperwork complete", "New accounts activated");
  }
  if (atLeast("initial_inspection") || atLeast("final_checklist_wait")) {
    mark("Interim checklist");
  }
  // Final checklist — only when ready for final / final scheduled (Levi rule)
  if (
    stage === "ready_for_final" ||
    stage === "final_inspection" ||
    stage === "passed_complete" ||
    stage === "meter_turn_on"
  ) {
    mark("Final checklist");
  }
  return steps;
}

/**
 * Build a permit record patch from a classified ConEd email / insight.
 */
export function buildConedPermitFromEmail({
  subject = "",
  body = "",
  from = "",
  messageId = "",
  address = "",
  dateTime = "",
  jobId = "",
  existing = null,
  receivedAt = "",
} = {}) {
  const eventType = classifyConedMessageType(subject, body);
  const mc = extractMcNumber(`${subject}\n${body}`) || existing?.primaryKey || "";
  const targetStage = stageForConedEvent(eventType);
  const currentStage = mergeConedStage(existing?.currentStage, targetStage);
  const bucket = STAGE_BUCKET[currentStage] || "Open";
  const health = stageHealth(currentStage);
  const now = receivedAt || new Date().toISOString();
  const event = {
    eventType,
    rawSourceRef: messageId || "",
    from: String(from || "").trim(),
    subject: String(subject || "").trim(),
    parsedFields: {
      dateTime: dateTime || "",
      address: address || "",
      mc,
    },
    createdAt: now,
  };
  const events = [...(existing?.events || []), event].slice(-40);
  const nextAction = nextActionForStage(currentStage, dateTime);
  return {
    id: existing?.id || (mc ? `permit-coned-${mc}` : `permit-coned-${Date.now()}`),
    jobId: jobId || existing?.jobId || "",
    agency: "coned",
    primaryKey: mc,
    addressNormalized: address || existing?.addressNormalized || "",
    currentStage,
    stageBucket: bucket,
    health,
    nextAction: nextAction.label,
    nextActionDate: nextAction.date || dateTime || existing?.nextActionDate || "",
    source: "email",
    blocksCloseout: ["Waiting-on-us", "At-risk", "Scheduled", "Open"].includes(bucket),
    events,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  };
}

export function nextActionForStage(stage, dateTime = "") {
  const label = CONED_STAGE_LABELS[stage] || "Open case";
  switch (stage) {
    case "final_checklist_wait":
      return { label: "Final checklist due — ball with us", date: "" };
    case "docs_pending":
      return { label: "Customer to-do list — docs pending", date: "" };
    case "deposit_due":
      return { label: "Deposit payment required", date: "" };
    case "at_risk":
      return { label: "Case inactivity — act soon", date: "" };
    case "layout_issued":
      return { label: "Service layout issued (60-day clock)", date: "" };
    case "final_inspection":
    case "initial_inspection":
      return {
        label: dateTime ? `Inspection ${dateTime.replace("T", " ").slice(0, 16)}` : label,
        date: dateTime || "",
      };
    case "ready_for_final":
      return { label: "Book final inspection", date: "" };
    case "passed_complete":
      return { label: "Passed — closeout eligible", date: dateTime || "" };
    case "failed_rework":
      return { label: "Failed final — rework + resubmit checklist", date: "" };
    default:
      return { label, date: dateTime || "" };
  }
}

/**
 * Job patch: enable Con Ed branch, advance paperwork steps, store permit record.
 * Merges with existing job.paperwork / job.permits.
 */
export function jobPatchFromConedPermit(permit, { dateTime = "", existingPaperwork = {} } = {}) {
  if (!permit) return {};
  const stage = permit.currentStage;
  const steps = paperworkStepsForStage(stage);
  // Final checklist: also when event said so even if stage merge stayed earlier
  const lastEvent = (permit.events || []).slice(-1)[0];
  if (lastEvent && shouldMarkFinalChecklistDone(lastEvent.eventType, stage)) {
    steps["Final checklist"] = true;
  }

  const dates = { ...(existingPaperwork?.coned?.dates || {}) };
  const eventType = lastEvent?.eventType || "";
  if (dateTime) {
    if (
      eventType.includes("final") ||
      stage === "final_inspection" ||
      stage === "ready_for_final" ||
      stage === "passed_complete"
    ) {
      dates["Inspection appointment"] = dateTime;
    } else if (eventType.includes("initial") || stage === "initial_inspection") {
      dates["Inspection appointment"] = dateTime;
    } else if (eventType.includes("field_crew") || /meter/i.test(eventType)) {
      dates["Meter installation date"] = dateTime.slice(0, 10);
    } else if (!dates["Inspection appointment"] && /inspection/i.test(eventType)) {
      dates["Inspection appointment"] = dateTime;
    }
  }

  // Merge permits list by primaryKey / id
  const conedPw = {
    enabled: true,
    steps: { ...(existingPaperwork?.coned?.steps || {}), ...steps },
    dates,
    caseNumber: permit.primaryKey || existingPaperwork?.coned?.caseNumber || "",
    currentStage: stage,
    stageLabel: CONED_STAGE_LABELS[stage] || stage,
    stageBucket: permit.stageBucket,
    health: permit.health,
    nextAction: permit.nextAction,
    nextActionDate: permit.nextActionDate,
  };

  return {
    paperwork: { coned: conedPw },
    permitRecord: permit, // caller merges into job.permits[]
  };
}

/**
 * Merge a permit into job.permits[] (replace same agency+key).
 */
export function mergePermitList(existingList = [], permit) {
  if (!permit) return existingList || [];
  const list = Array.isArray(existingList) ? [...existingList] : [];
  const key = permit.primaryKey || permit.id;
  const idx = list.findIndex(
    (p) =>
      p &&
      p.agency === permit.agency &&
      ((key && (p.primaryKey === key || p.id === key)) || p.id === permit.id)
  );
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...permit,
      events: permit.events || prev.events,
      currentStage: mergeConedStage(prev.currentStage, permit.currentStage),
      stageBucket: STAGE_BUCKET[mergeConedStage(prev.currentStage, permit.currentStage)] || permit.stageBucket,
      health: stageHealth(mergeConedStage(prev.currentStage, permit.currentStage)),
    };
  } else {
    list.push(permit);
  }
  return list;
}

/** True when insight is ConEd agency (or Energy Services). */
export function isConedAgencyInsight(insight) {
  if (!insight) return false;
  if (insight.agency === "coned") return true;
  const from = insight?.source?.from || "";
  const subj = insight?.source?.subject || "";
  return /con\s*ed|@coned\.com|cpms\.noreply|energy\s*services|appointments@coned/i.test(
    `${from} ${subj}`
  );
}

/**
 * Full pipeline: insight → permit + job patch pieces.
 */
export function conedPatchFromInsight(insight, job = null) {
  if (!isConedAgencyInsight(insight) && insight?.agency !== "coned") {
    // Still allow when subject is pure Deposit Payment Required
    const subj = insight?.source?.subject || "";
    if (!/deposit\s+payment\s+required/i.test(subj)) return null;
  }
  const existingList = job?.permits || [];
  const mc =
    extractMcNumber(
      `${insight?.source?.subject || ""}\n${insight?.emailSnippet || ""}\n${insight?.summary || ""}`
    ) || "";
  const existing =
    existingList.find((p) => p.agency === "coned" && (p.primaryKey === mc || (!mc && p.jobId === job?.id))) ||
    existingList.find((p) => p.agency === "coned") ||
    null;

  const permit = buildConedPermitFromEmail({
    subject: insight?.source?.subject || "",
    body: insight?.emailSnippet || insight?.summary || "",
    from: insight?.source?.from || "",
    messageId: insight?.source?.messageId || insight?.id || "",
    address: insight?.address || job?.serviceAddress || job?.address || "",
    dateTime: insight?.dateTime || "",
    jobId: job?.id || insight?.jobId || "",
    existing,
    receivedAt: insight?.source?.receivedAt || "",
  });

  // Prefer MC from body if extract found it
  if (mc && !permit.primaryKey) permit.primaryKey = mc;

  const piece = jobPatchFromConedPermit(permit, {
    dateTime: insight?.dateTime || "",
    existingPaperwork: job?.paperwork || {},
  });

  return {
    permit,
    paperwork: piece.paperwork,
    permits: mergePermitList(existingList, permit),
  };
}
