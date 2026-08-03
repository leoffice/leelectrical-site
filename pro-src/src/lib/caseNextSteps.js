/**
 * Case next-step recommender for the Permits tab.
 *
 * Grounded in Levi's 1337 President / MC-941580 walkthrough (2026-08-03):
 * after a case opens → optional new meter + required electrical permit;
 * final checklist only when account is active; deposit email → customer
 * reminder (no card capture until portal pay is verified); after final
 * pass wait 1 week then inquiry if no install date.
 *
 * Case walk 2026-08-03 (Lincoln / Kingston / 37th):
 *  - Existing account + need PLP → add PLP account, then create permit
 *  - Inquiry response back → email customer with results + instructions
 *  - Final inspection passed + ready → close case
 *  - Service already done, no permits → Request inspection (skill to learn)
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
 *   action?: string,
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
  if (todoDone(job, ["new_meter", "add_plp_account", "new_meter_plp"])) return true;
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
  if (job?.paperwork?.coned?.existingAccount === true) return true;
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

/** Lincoln-style: already has account(s); need one more PLP account. */
export function needsPlpAccount(job = {}) {
  const c = job?.paperwork?.coned || {};
  if (c.needsPlpAccount === true || c.needsAdditionalAccount === true) return true;
  const label = s(c.additionalAccountLabel);
  if (label && /^plp$/i.test(label)) return true;
  const existing = Number(c.existingAccounts);
  const target = Number(c.targetAccounts);
  if (Number.isFinite(existing) && Number.isFinite(target) && existing < target) return true;
  return false;
}

function plpAccountDone(job) {
  if (todoDone(job, ["add_plp_account", "new_meter_plp"])) return true;
  const plp = job?.paperwork?.coned?.plpAccount;
  if (plp && (plp.status === "done" || plp.submitted || plp.attached)) return true;
  if (meterDone(job)) {
    const m = getMeterApplication(job);
    const blob = `${m?.label || ""} ${m?.value || ""} ${m?.title || ""}`;
    if (/plp/i.test(blob)) return true;
  }
  return false;
}

/** Kingston-style: Con Ed inquiry returned — email customer results + instructions. */
export function inquiryCustomerFollowUpNeeded(job = {}) {
  const inq = job?.paperwork?.coned?.inquiry;
  if (!inq || typeof inq !== "object") return false;
  if (inq.customerFollowedUp || inq.followUpSent || inq.status === "customer_notified") return false;
  return !!(
    inq.customerFollowUpNeeded === true ||
    inq.responseReceived === true ||
    inq.status === "response_received"
  );
}

function inquiryFollowUpDone(job) {
  const inq = job?.paperwork?.coned?.inquiry;
  return !!(inq && (inq.customerFollowedUp || inq.followUpSent || inq.status === "customer_notified"));
}

/** 37th-style: final passed — close the case. */
export function readyToCloseCase(job = {}, stage = "") {
  const c = job?.paperwork?.coned || {};
  if (c.caseClosed === true || stage === "closed" || stage === "cancelled") return false;
  if (c.readyToClose === true) return true;
  if (c.closeRequested === true) return true;
  return false;
}

function caseClosed(job, stage) {
  const c = job?.paperwork?.coned || {};
  return c.caseClosed === true || stage === "closed" || stage === "cancelled";
}

/** Service finished but no permit case yet — Request inspection skill later. */
export function serviceCompleteNoPermit(job = {}) {
  return !!(
    job?.paperwork?.coned?.serviceCompleteNoPermit ||
    job?.paperwork?.serviceCompleteNoPermit
  );
}

/**
 * Resolve current Con Ed stage from job permit or paperwork summary.
 */
export function resolveCaseStage(job = {}) {
  const conedPermit = Array.isArray(job?.permits)
    ? job.permits.find((p) => String(p?.agency || "").toLowerCase() === "coned")
    : null;
  const fromPermit = s(conedPermit?.currentStage);
  const fromPaper = s(job?.paperwork?.coned?.currentStage);
  if (fromPermit || fromPaper) return fromPermit || fromPaper;
  if (job?.paperwork?.coned?.caseClosed === true) return "closed";
  if (
    s(job?.paperwork?.coned?.caseNumber) ||
    s(job?.paperwork?.coned?.createCase?.execution?.caseNumber)
  ) {
    return "application_filed";
  }
  return "";
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
  const coned = job?.paperwork?.coned || {};

  const caseOpen =
    !!stage ||
    !!s(coned.caseNumber) ||
    !!s(coned.createCase?.execution?.caseNumber);

  const noPermitService = serviceCompleteNoPermit(job);

  if (!caseOpen && !noPermitService) {
    return {
      stage: "",
      recommended: null,
      dueNow: [],
      steps: [],
      summary: "",
    };
  }

  // —— 0a. Closed ——
  if (caseClosed(job, stage)) {
    steps.push({
      id: "close_case",
      title: "Case closed",
      required: true,
      status: "done",
      note: "Final inspection passed — no more work",
      action: "none",
    });
    return finalize(steps, stage);
  }

  // —— 0b. Service done, no permits (skill still to learn) ——
  if (noPermitService && !caseOpen) {
    steps.push({
      id: "request_inspection_after_service",
      title: "Request inspection",
      required: true,
      status: "blocked",
      gate: "skill_not_learned",
      note: "Skill not learned yet — teach portal request-inspection before auto-run",
      action: "skill_learn",
    });
    return finalize(steps, stage || "service_complete");
  }

  // —— 0c. Ready to close (37th) ——
  if (readyToCloseCase(job, stage) && inspectionPassed(job, stage)) {
    steps.push({
      id: "close_case",
      title: "Close case",
      required: true,
      status: "due",
      note: "Last inspection passed — mark case closed",
      action: "close_case",
    });
    return finalize(steps, stage);
  }

  // —— 0d. Inquiry response → email customer (Kingston) ——
  if (inquiryFollowUpDone(job)) {
    steps.push({
      id: "inquiry_customer_followup",
      title: "Customer notified on inquiry",
      required: true,
      status: "done",
      action: "email_inquiry_followup",
    });
  } else if (inquiryCustomerFollowUpNeeded(job)) {
    const inqId = s(coned.inquiry?.id || coned.inquiry?.inquiryId);
    steps.push({
      id: "inquiry_customer_followup",
      title: "Email customer — inquiry results + instructions",
      required: true,
      status: "due",
      note: inqId
        ? `Inquiry ${inqId} came back — tell them what to do and to reply when done`
        : "Inquiry came back — tell them what to do and to reply when done",
      action: "email_inquiry_followup",
    });
  }

  const needPlp = needsPlpAccount(job);
  const plpDone = plpAccountDone(job);
  const active = accountActive(job, stage);

  // —— 1. PLP / additional account (Lincoln) OR optional new meter ——
  if (needPlp) {
    if (plpDone) {
      steps.push({
        id: "add_plp_account",
        title: "Add PLP account",
        required: true,
        status: "done",
        note: "PLP account submitted",
        action: "meter_application",
      });
    } else {
      steps.push({
        id: "add_plp_account",
        title: "Add PLP account",
        required: true,
        status: "due",
        note: active
          ? "Already has account(s) — add the PLP, then create permit"
          : "Add the PLP account (meter application)",
        action: "meter_application",
      });
    }
  } else if (meterDone(job)) {
    steps.push({
      id: "new_meter",
      title: "New meter application",
      required: false,
      status: "done",
      note: "Submitted",
      action: "meter_application",
    });
  } else if (meterSelected(job) || hasTodoKind(job, ["new_meter"])) {
    steps.push({
      id: "new_meter",
      title: "New meter application",
      required: false,
      status: "due",
      note: "Optional for this case — submit when ready",
      action: "meter_application",
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
      action: "meter_application",
    });
  }

  // —— 2. Electrical permit (required after case open) ——
  // Lincoln: after PLP; 1337: due with optional meter
  const permitBlockedByPlp = needPlp && !plpDone;
  if (electricalPermitDone(job)) {
    steps.push({
      id: "electrical_permit",
      title: "Electrical permit (DOB)",
      required: true,
      status: "done",
      action: "electrical_permit",
    });
  } else if (
    stage &&
    stage !== "cancelled" &&
    !["meter_turn_on", "closed"].includes(stage)
  ) {
    steps.push({
      id: "electrical_permit",
      title: "Create electrical permit",
      required: true,
      status: permitBlockedByPlp ? "blocked" : "due",
      gate: permitBlockedByPlp ? "add_plp_account" : undefined,
      note: permitBlockedByPlp
        ? "After PLP account is added"
        : "Required — file when ready (L1, EL = Electrical Permit)",
      action: "electrical_permit",
    });
  }

  // —— 3. Deposit watch / customer reminder ——
  // Skip deposit path when account already active (Lincoln-style existing service)
  const depEmail = depositEmailReceived(job, stage);
  const depDone = depositConfirmed(job) || (active && coned.existingAccount === true);
  const depFollowed = depositCustomerFollowedUp(job);
  const submittedMs = submittedAtMs(job);
  const weekAfterSubmit = submittedMs > 0 && now - submittedMs >= CASE_FOLLOWUP_MS;

  if (active && (coned.existingAccount === true || coned.accountActive === true) && !depEmail) {
    steps.push({
      id: "deposit",
      title: "Account already active",
      required: true,
      status: "done",
      note: "No deposit wait — account exists",
    });
  } else if (depDone && !depEmail) {
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
      action: "email_deposit_reminder",
    });
  } else if (
    !active &&
    (weekAfterSubmit || stage === "application_filed") &&
    coned.existingAccount !== true
  ) {
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
  if (stage === "final_checklist_wait" || stage === "ready_for_final") {
    steps.push({
      id: "final_checklist",
      title: "Final inspection checklist",
      required: true,
      status: "due",
      note: active ? "Account active — submit checklist" : "Account active",
      action: "final_checklist",
    });
  } else if (electricalPermitDone(job) && !inspectionPassed(job, stage)) {
    if (active) {
      steps.push({
        id: "final_checklist",
        title: "Final inspection checklist",
        required: true,
        status: "due",
        note: "Account active + electrical permit done",
        action: "final_checklist",
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
  const depOk = depDone || depositConfirmed(job);
  if (
    depOk &&
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
      action: "request_inspection",
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
  // Skip if ready-to-close already handled above
  if (inspectionPassed(job, stage) && !readyToCloseCase(job, stage)) {
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
        action: "submit_inquiry",
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
      action: "coned_todos",
    });
  }

  return finalize(steps, stage);
}

function finalize(steps, stage) {
  const dueNow = steps.filter((st) => st.status === "due");
  // Prefer time-sensitive money / customer emails / close over long-running permit work
  const PRIORITY = [
    "close_case",
    "inquiry_customer_followup",
    "coned_todos",
    "deposit_customer_followup",
    "deposit_watch",
    "add_plp_account",
    "post_pass_inquiry",
    "request_inspection",
    "request_inspection_after_service",
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
    else if (steps.some((st) => st.id === "close_case" && st.status === "done")) {
      summary = "Case closed";
    }
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

/**
 * Mark a step executed (customer email sent, case closed, etc.) — pure patch.
 * @returns {object|null} job patch fragment
 */
export function caseStepCompletePatch(stepId, extra = {}) {
  const id = s(stepId);
  const now = new Date().toISOString();
  if (id === "inquiry_customer_followup") {
    return {
      paperwork: {
        coned: {
          inquiry: {
            customerFollowedUp: true,
            followUpSent: true,
            status: "customer_notified",
            followedUpAt: now,
            ...extra,
          },
        },
      },
    };
  }
  if (id === "close_case") {
    return {
      paperwork: {
        coned: {
          caseClosed: true,
          readyToClose: false,
          currentStage: "closed",
          stageLabel: "Closed",
          closedAt: now,
          ...extra,
        },
      },
      permits: extra.permits,
    };
  }
  if (id === "add_plp_account") {
    return {
      paperwork: {
        coned: {
          plpAccount: { status: "done", submitted: true, submittedAt: now, ...extra },
          needsPlpAccount: false,
          needsAdditionalAccount: false,
        },
        todos: undefined,
      },
    };
  }
  if (id === "deposit_customer_followup") {
    return {
      paperwork: {
        coned: {
          deposit: {
            customerReminded: true,
            followUpSent: true,
            status: "reminded",
            remindedAt: now,
            ...extra,
          },
        },
      },
    };
  }
  return null;
}
