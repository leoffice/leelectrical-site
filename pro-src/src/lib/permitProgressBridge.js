/**
 * Permit progress ↔ Job progress bridge (LEPRO-PERMIT-JOB-PROGRESS-LINK).
 *
 * Single editable table: permit.currentStage → which top-level job.status
 * stages should be marked done. Used by Con Ed + City brains, email apply,
 * and permit backfill so Permits tab and Job Information → Progress stay
 * consistent.
 *
 * Non-destructive: never un-checks a step; never overwrites done/skipped.
 * Idempotent: re-applying the same stage is a no-op when already cleared.
 */

import { todayStr } from "./format.js";

/**
 * EDIT THIS TABLE to retune which Progress checkmarks a permit milestone flips.
 * Values are cumulative (later milestones include earlier job stages).
 * Job stage names MUST match STAGES in stages.js exactly.
 */
export const PERMIT_STAGE_TO_JOB_STATUS = {
  // ── City / DOB NOW: Electrical ──────────────────────────────────────────
  filing_submitted: ["Paperwork"],
  under_review: ["Paperwork"],
  objections: ["Paperwork"],
  permit_issued: ["Paperwork"],
  inspection_scheduled: ["Paperwork", "Scheduled"],
  inspection_failed: ["Paperwork", "Scheduled"],
  inspection_passed: ["Paperwork", "Scheduled", "Done"],
  signed_off: ["Paperwork", "Scheduled", "Done"],
  // cancelled: intentionally empty — don't auto-check progress on cancel

  // ── Con Edison ──────────────────────────────────────────────────────────
  application_filed: ["Paperwork"],
  docs_pending: ["Paperwork"],
  survey_service_date: ["Paperwork"],
  layout_issued: ["Paperwork"],
  awaiting_initial_visit: ["Paperwork"],
  initial_inspection: ["Paperwork", "Scheduled"],
  deposit_due: ["Paperwork"],
  final_checklist_wait: ["Paperwork"],
  ready_for_final: ["Paperwork"],
  final_inspection: ["Paperwork", "Scheduled"],
  field_crew: ["Paperwork", "Scheduled"],
  no_show_reschedule: ["Paperwork", "Scheduled"],
  failed_rework: ["Paperwork", "Scheduled"],
  at_risk: ["Paperwork"],
  passed_complete: ["Paperwork", "Scheduled", "Done"],
  meter_turn_on: ["Paperwork", "Scheduled", "Done"],
  // cancelled: empty
};

/** Stages that mean "inspection / job done" for reporting. */
export const PERMIT_PASS_STAGES = new Set([
  "inspection_passed",
  "signed_off",
  "passed_complete",
  "meter_turn_on",
]);

/**
 * Job stages a permit stage should mark done (from the editable table).
 * @param {string} permitStage
 * @param {Record<string, string[]>} [map]
 * @returns {string[]}
 */
export function jobStagesForPermitStage(permitStage, map = PERMIT_STAGE_TO_JOB_STATUS) {
  if (!permitStage) return [];
  return Array.isArray(map[permitStage]) ? [...map[permitStage]] : [];
}

/**
 * True when existing job.status[stage] is already cleared (done or skipped).
 * Skipped is treated as intentionally cleared — do not overwrite.
 */
export function isStatusCleared(existingStatus, stage) {
  const s = (existingStatus && existingStatus[stage] && existingStatus[stage].s) || "";
  return s === "done" || s === "skipped";
}

/**
 * Build a non-destructive job.status patch from a permit milestone.
 *
 * @param {string} permitStage - permit.currentStage
 * @param {{
 *   date?: string,
 *   existingStatus?: Record<string, {s?: string, d?: string}>,
 *   map?: Record<string, string[]>,
 * }} [opts]
 * @returns {{ status?: Record<string, {s: string, d: string}> }}
 */
export function jobStatusPatchFromPermitStage(permitStage, opts = {}) {
  const {
    date = "",
    existingStatus = {},
    map = PERMIT_STAGE_TO_JOB_STATUS,
  } = opts;
  const targets = jobStagesForPermitStage(permitStage, map);
  if (!targets.length) return {};

  const d = String(date || todayStr()).slice(0, 10);
  const status = {};
  for (const stage of targets) {
    if (isStatusCleared(existingStatus, stage)) continue;
    const prev = (existingStatus && existingStatus[stage]) || {};
    status[stage] = { s: "done", d: prev.d || d };
  }
  return Object.keys(status).length ? { status } : {};
}

/**
 * Merge multiple status patches non-destructively (later only fills blanks).
 * Useful when a job has both Con Ed + City permits.
 */
export function mergeStatusPatches(...patches) {
  const out = {};
  for (const p of patches) {
    const st = p && p.status;
    if (!st) continue;
    for (const [stage, val] of Object.entries(st)) {
      if (!val || !val.s) continue;
      const cur = out[stage];
      if (cur && (cur.s === "done" || cur.s === "skipped")) continue;
      out[stage] = { s: val.s, d: val.d || cur?.d || todayStr() };
    }
  }
  return Object.keys(out).length ? { status: out } : {};
}

/**
 * Highest-priority permit stage across a list (by how many job stages it unlocks,
 * then by pass stages). Used by backfill when a job has multiple permits.
 */
export function leadingPermitStage(permits = []) {
  let best = "";
  let bestScore = -1;
  for (const p of permits || []) {
    const stage = p && p.currentStage;
    if (!stage) continue;
    const n = jobStagesForPermitStage(stage).length;
    const bonus = PERMIT_PASS_STAGES.has(stage) ? 10 : 0;
    const score = n * 10 + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = stage;
    }
  }
  return best;
}

/**
 * From a job's permits[] + paperwork stage fields, compute the status patch
 * that should already be applied (for audit/backfill).
 *
 * @param {object} job
 * @param {{ date?: string }} [opts]
 */
export function jobStatusPatchFromJobPermits(job, opts = {}) {
  if (!job) return {};
  const permits = Array.isArray(job.permits) ? job.permits : [];
  const stages = [];
  for (const p of permits) {
    if (p && p.currentStage) stages.push(p.currentStage);
  }
  const pw = job.paperwork || {};
  if (pw.coned && pw.coned.currentStage) stages.push(pw.coned.currentStage);
  if (pw.dob && pw.dob.currentStage) stages.push(pw.dob.currentStage);

  // Synthetic permit list so leadingPermitStage can score them
  const synthetic = stages.map((currentStage) => ({ currentStage }));
  const lead = leadingPermitStage(synthetic);
  if (!lead) return {};

  // Prefer date from the leading permit event / nextActionDate
  let date = opts.date || "";
  if (!date) {
    for (const p of permits) {
      if (p && p.currentStage === lead) {
        date =
          (p.nextActionDate || "").slice(0, 10) ||
          (p.updatedAt && String(p.updatedAt).slice(0, 10)) ||
          "";
        break;
      }
    }
  }
  return jobStatusPatchFromPermitStage(lead, {
    date,
    existingStatus: job.status || {},
  });
}

/**
 * City DOB paperwork.steps that should be true for a given city stage.
 * Keeps the nested DOB sub-checklist in step with permit.currentStage.
 */
export function dobPaperworkStepsForStage(stage) {
  const steps = {};
  const order = [
    "filing_submitted",
    "under_review",
    "objections",
    "permit_issued",
    "inspection_scheduled",
    "inspection_passed",
    "signed_off",
  ];
  const idx = order.indexOf(stage);
  const atLeast = (s) => {
    const i = order.indexOf(s);
    return idx >= 0 && i >= 0 && idx >= i;
  };
  if (atLeast("permit_issued")) steps["Permit issued"] = true;
  if (atLeast("inspection_scheduled")) {
    steps["Inspection requested"] = true;
    steps["Inspection scheduled"] = true;
  }
  // Passed / signed off — mark self-cert + PAA when fully terminal
  if (atLeast("signed_off")) {
    steps["Self certification"] = true;
    steps["PAA complete"] = true;
  }
  return steps;
}
