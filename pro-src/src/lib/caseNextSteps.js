/**
 * Case next-step recommender for the Permits tab.
 *
 * Grounded in Levi's 1337 President / MC-941580 walkthrough (2026-08-03):
 * after a case opens → optional new meter + required electrical permit;
 * final checklist only when account is active; deposit email → customer
 * reminder (no card capture until portal pay is verified); after final
 * pass wait 1 week then inquiry if no install date.
 *
 * Pure functions only — no network. UI and board attach the result.
 */

import { getMeterApplication } from "../modules/permits/meterApplication.js";
import { listPaperworkTodos } from "./agencyForms/paperworkTodos.js";

const s = (v) => (v == null ? "" : String(v).trim());

/** One week in ms — deposit watch / post-pass inquiry. */
export const CASE_FOLLOWUP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @typedef {'due'|'waiting'|'blocked'|'done'|'upcoming'} StepStatus
 * @typedef {{
 *   id: string,
 *   title: string,
 *   required: boolean,
 *   status: StepStatus,
 *   note?: string,
 *   gate?: string,
 * }} CaseStep
 */

function hasTodoKind(job, kinds) {
  const set = new Set((Array.isArray(kinds) ? kinds : [kinds]).map(String));
  return listPaperworkTodos(job).some(
    (t) => t && set.has(t.kind) && t.status !== "removed"
  );
}

function todoDone(job, kinds) {
  const set = new Set((Array.isArray(kinds) ? kinds : [kinds]).map(String));
  const arr = Array.isArray(job?.paperwork?.todos) ? job.paperwork.todos : [];
  return arr.some((t) => t && set.has(t.kind) && t.status === "done");
}

function meterSelected(job) {
  const m = getMeterApplication(job);
  return !!(m && m.value && m.value !== "none" && m.value !== "not_applicable");
}

function meterDone(job) {
  if (todoDone(job, ["new_meter"])) return true;
  const md = job?.paperwork?.coned?.meterDeploy;
  if (md && (md.status === "done" || md.status === "submitted" || md.attached)) return true;
  return false;
}

function electricalPermitDone(job) {
  if (todoDone(job, ["file_electrical_permit"])) return true;
  const city = Array.isArray(job?.permits)
    ? job.permits.find((p) => {
        const a = String(p?.agency || "").toLowerCase();
        return a === "dob" || a === "city";
      })
    : null;
  if (city && (city.currentStage === "permit_issued" || city.permitNumber)) return true;
  if (job?.paperwork?.dob?.electricalPermit?.status === "done") return true;
  if (job?.paperwork?.dob?.permitNumber) return true;
  return false;
}

function accountActive(job, stage) {
  // Explicit flag, deposit confirmed, or stages past money gate
  if (job?.paperwork?.coned?.accountActive === true) return true;
  if (job?.paperwork?.coned?.deposit?.status === "paid" || job?.paperwork?.coned?.deposit?.confirmed) {
    return true;
  }
  const activeStages = new Set([
    "final_checklist_wait",
    "ready_for_final",
    "final_inspection",
    "passed_complete",
    "meter_turn_on",
  ]);
  return activeStages.has(stage);
}

function depositEmailReceived(job, stage) {
  if (stage === "deposit_due") return true;
  const d = job?.paperwork?.coned?.deposit;
  if (d && (d.emailReceived || d.status === "due" || d.status === "requested")) return true;
  return false;
}

function depositCustomerFollowedUp(job) {
  const d = job?.paperwork?.coned?.deposit;
  return !!(d && (d.customerReminded || d.followUpSent || d.status === "reminded"));
}

function depositConfirmed(job) {
  const d = job?.paperwork?.coned?.deposit;
  return !!(d && (d.confirmed || d.status === "paid" || d.customerConfirmed));
}

function inspectionPassed(job, stage) {
  if (stage === "passed_complete" || stage === "meter_turn_on") return true;
  if (job?.paperwork?.coned?.finalInspection?.result === "passed") return true;
  return false;
}

function hasInstallDate(job) {
  return !!(
    s(job?.paperwork?.coned?.installDate) ||
    s(job?.paperwork?.coned?.meterInstallDate) ||
    s(job?.paperwork?.coned?.serviceDate)
  );
}

function submittedAtMs(job) {
  const raw =
    job?.paperwork?.coned?.submittedAt ||
    job?.paperwork?.coned?.createCase?.execution?.submittedAt ||
    job?.paperwork?.coned?.lastProcess?.completedAt ||
    job?.paperwork?.coned?.applicationFiledAt ||
    "";
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function finalPassedAtMs(job) {
  const raw =
    job?.paperwork?.coned?.finalInspection?.passedAt ||
    job?.paperwork?.coned?.passedAt ||
    "";
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Resolve current Con Ed stage from job permit or paperwork summary.
 */
export function resolveCaseStage(job = {}) {
  const conedPermit = Array.isArray(job?.permits)
    ? job.permits.find((p) => String(p?.agency || "").toLowerCase() === "coned")
    : null;
  return (
    s(conedPermit?.currentStage) ||
    s(job?.paperwork?.coned?.currentStage) ||
    (s(job?.paperwork?.coned?.caseNumber) || s(job?.paperwork?.coned?.createCase?.execution?.caseNumber)
      ? "application_filed"
      : "")
  );
}

/**
 * Build ordered next-step recommendations for a Con Ed case on a job.
 * @param {object} job
 * @param {{ now?: number }} [opts]
 * @returns {{ stage: string, recommended: CaseStep|null, dueNow: CaseStep[], steps: CaseStep[], summary: string }}
 */
export function recommendCaseNextSteps(job = {}, { now = Date.now() } = {}) {
  const stage = resolveCaseStage(job);
  const steps = [];

  const caseOpen =
    !!stage ||
    !!s(job?.paperwork?.coned?.caseNumber) ||
    !!s(job?.paperwork?.coned?.createCase?.execution?.caseNumber);

  if (!caseOpen) {
    return {
      stage: "",
      recommended: null,
      dueNow: [],
      steps: [],
      summary: "",
    };
  }

  // —— 1. New meter (optional) ——
  if (meterDone(job)) {
    steps.push({
      id: "new_meter",
      title: "New meter application",
      required: false,
      status: "done",
      note: "Submitted",
    });
  } else if (meterSelected(job) || hasTodoKind(job, ["new_meter"])) {
    steps.push({
      id: "new_meter",
      title: "New meter application",
      required: false,
      status: "due",
      note: "Optional for this case — submit when ready",
    });
  } else if (
    stage === "application_filed" ||
    stage === "docs_pending" ||
    !stage ||
    stage === "deposit_due"
  ) {
    steps.push({
      id: "new_meter",
      title: "New meter application",
      required: false,
      status: "due",
      note: "Optional — only if this case needs a new meter",
    });
  }

  // —— 2. Electrical permit (required after case open) ——
  if (electricalPermitDone(job)) {
    steps.push({
      id: "electrical_permit",
      title: "Electrical permit (DOB)",
      required: true,
      status: "done",
    });
  } else if (
    stage &&
    stage !== "cancelled" &&
    !["meter_turn_on"].includes(stage)
  ) {
    steps.push({
      id: "electrical_permit",
      title: "Electrical permit (DOB)",
      required: true,
      status: "due",
      note: "Required — file when ready (L1, EL = Electrical Permit)",
    });
  }

  // —— 3. Deposit watch / customer reminder ——
  const depEmail = depositEmailReceived(job, stage);
  const depDone = depositConfirmed(job);
  const depFollowed = depositCustomerFollowedUp(job);
  const submittedMs = submittedAtMs(job);
  const weekAfterSubmit = submittedMs > 0 && now - submittedMs >= CASE_FOLLOWUP_MS;

  if (depDone) {
    steps.push({
      id: "deposit",
      title: "Deposit paid / confirmed",
      required: true,
      status: "done",
      note: "Customer confirmed payment",
    });
  } else if (depEmail || stage === "deposit_due") {
    steps.push({
      id: "deposit_customer_followup",
      title: depFollowed
        ? "Waiting on customer deposit payment"
        : "Email customer — pay Con Ed deposit",
      required: true,
      status: depFollowed ? "waiting" : "due",
      note: "Remind only — do not take card info until portal pay is verified",
    });
  } else if (weekAfterSubmit || stage === "application_filed") {
    steps.push({
      id: "deposit_watch",
      title: weekAfterSubmit
        ? "Watch for deposit-request email"
        : "Deposit email expected ~1 week after submit",
      required: true,
      status: weekAfterSubmit ? "due" : "upcoming",
      note: "When Con Ed asks for deposit, follow up with the customer",
    });
  }

  // —— 4. Final inspection checklist (gated on account active) ——
  const active = accountActive(job, stage);
  if (stage === "final_checklist_wait" || stage === "ready_for_final") {
    steps.push({
      id: "final_checklist",
      title: "Final inspection checklist",
      required: true,
      status: "due",
      note: active ? "Account active — submit checklist" : "Account active",
    });
  } else if (electricalPermitDone(job) && !inspectionPassed(job, stage)) {
    if (active) {
      steps.push({
        id: "final_checklist",
        title: "Final inspection checklist",
        required: true,
        status: "due",
        note: "Account active + electrical permit done",
      });
    } else {
      steps.push({
        id: "final_checklist",
        title: "Final inspection checklist",
        required: true,
        status: "blocked",
        gate: "account_active",
        note: "Only after account is active (deposit paid)",
      });
    }
  } else if (!electricalPermitDone(job) && caseOpen && stage !== "cancelled") {
    steps.push({
      id: "final_checklist",
      title: "Final inspection checklist",
      required: true,
      status: "blocked",
      gate: "electrical_permit_and_account",
      note: "After electrical permit + account active",
    });
  }

  // —— 5. Request inspection (after deposit confirmed + checklist path) ——
  if (
    depDone &&
    active &&
    electricalPermitDone(job) &&
    !inspectionPassed(job, stage) &&
    stage !== "final_inspection"
  ) {
    const checklistDue = stage === "final_checklist_wait" || stage === "ready_for_final";
    steps.push({
      id: "request_inspection",
      title: checklistDue
        ? "Finish checklist then request inspection"
        : "Request inspection",
      required: true,
      status: "due",
      note: "After deposit confirmation email from customer",
    });
  } else if (stage === "final_inspection" || stage === "initial_inspection") {
    steps.push({
      id: "inspection_scheduled",
      title: "Inspection scheduled",
      required: true,
      status: "waiting",
      note: "Waiting for result",
    });
  }

  // —— 6. Post-pass: 1 week → inquiry if no install date ——
  if (inspectionPassed(job, stage)) {
    if (hasInstallDate(job)) {
      steps.push({
        id: "install_date",
        title: "Meter install date on file",
        required: true,
        status: "done",
      });
    } else {
      const passedMs = finalPassedAtMs(job) || submittedMs;
      const weekAfterPass = !passedMs || now - passedMs >= CASE_FOLLOWUP_MS;
      steps.push({
        id: "post_pass_inquiry",
        title: weekAfterPass
          ? "Inquiry — ask for meter install date"
          : "Follow up in 1 week if no install date",
        required: true,
        status: weekAfterPass ? "due" : "upcoming",
        note: "After final pass, inquire if install date still missing",
      });
    }
  }

  // —— 7. Docs pending (Con Ed to-do list) ——
  if (stage === "docs_pending") {
    steps.unshift({
      id: "coned_todos",
      title: "Work Con Ed To-Do list",
      required: true,
      status: "due",
      note: "Customer/contractor items on Project Center",
    });
  }

  const dueNow = steps.filter((st) => st.status === "due");
  // Prefer time-sensitive money / Con Ed to-do over long-running permit work
  const PRIORITY = [
    "coned_todos",
    "deposit_customer_followup",
    "deposit_watch",
    "post_pass_inquiry",
    "request_inspection",
    "final_checklist",
    "electrical_permit",
    "new_meter",
  ];
  const rank = (id) => {
    const i = PRIORITY.indexOf(id);
    return i === -1 ? 99 : i;
  };
  const dueSorted = [...dueNow].sort((a, b) => {
    if (!!a.required !== !!b.required) return a.required ? -1 : 1;
    return rank(a.id) - rank(b.id);
  });
  const recommended = dueSorted[0] || null;

  let summary = "";
  if (recommended) {
    summary = recommended.required
      ? `Next: ${recommended.title}`
      : `Next (optional): ${recommended.title}`;
    if (dueNow.length > 1) {
      summary += ` · ${dueNow.length} due now`;
    }
  } else {
    const waiting = steps.find((st) => st.status === "waiting" || st.status === "upcoming");
    if (waiting) summary = waiting.title;
  }

  return { stage, recommended, dueNow, steps, summary };
}

/**
 * Short next-action string for board rows (overrides vague stage labels).
 */
export function caseNextActionLabel(job = {}, fallback = "") {
  const rec = recommendCaseNextSteps(job);
  if (rec.summary) return rec.summary;
  return s(fallback);
}
