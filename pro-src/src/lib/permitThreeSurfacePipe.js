/**
 * Three permit surfaces, one pipe (Levi 2026-08-06).
 *
 * Feeder (source of truth on the job):
 *   job.paperwork.{coned|dob|city} + job.permits[] + job.permitTracker
 *
 * Surfaces (all read/write the same fields — no separate stores):
 *   1. Job Information → Paperwork toggle  (master valve)
 *   2. Job Paperwork panel / Progress branches  (detail UI)
 *   3. Permits tab  (fleet UI + deploy tools + renew schedule)
 *
 * Open-application rule:
 *   Open Con Ed case or open DOB permit ⇒ pipe ON so all three show the same info.
 *   Complete / terminal stages do NOT auto-enable.
 *
 * Yearly renew (city electrical): flag only — auto email stays OFF until Levi launches
 * (see LEPRO_PERMIT_RENEWAL_SCHEDULE_SPEC.md).
 */

import {
  enableConedPermitTrackerPatch,
  enableDobPermitTrackerPatch,
  isOnPermitTracker,
  setPermitTrackerPatch,
} from "./permitTrackerSeed.js";
import { STAGE_BUCKET } from "./conedPermit.js";
import { CITY_STAGE_BUCKET } from "./cityPermit.js";
import { todayStr } from "./stages.js";

/** Stages that mean "done / closed" — do not auto-open the pipe. */
const CONED_TERMINAL = new Set(["passed_complete", "meter_turn_on", "cancelled"]);
const CITY_TERMINAL = new Set(["signed_off", "cancelled"]);

function bucketOf(agency, stage, explicit) {
  if (explicit) return String(explicit);
  const a = String(agency || "").toLowerCase();
  if (a === "coned" || a === "con-ed") return STAGE_BUCKET[stage] || "";
  if (a === "city" || a === "dob") return CITY_STAGE_BUCKET[stage] || "";
  return "";
}

/**
 * True when a stage is complete / cancelled (not "open" for auto-pipe).
 * @param {"coned"|"city"|"dob"|string} agency
 * @param {string} stage
 * @param {string} [bucket]
 */
export function isPermitStageTerminal(agency, stage, bucket) {
  const a = String(agency || "").toLowerCase();
  const s = String(stage || "").toLowerCase();
  const b = String(bucket || bucketOf(a, s) || "").toLowerCase();
  if (b === "terminal" || b === "passed") return true;
  if (a === "coned" || a === "con-ed") return CONED_TERMINAL.has(s);
  if (a === "city" || a === "dob") return CITY_TERMINAL.has(s);
  return false;
}

/**
 * Master valve state for Job Information Paperwork toggle.
 * True when any of the three surfaces should treat the job as "on the pipe".
 */
export function isPaperworkPipeOn(job) {
  if (!job) return false;
  if (job.permitTracker === true) return true;
  if (isOnPermitTracker(job)) return true;
  if (job.paperwork?.permitTracker === true) return true;
  if (job.paperwork?.coned?.enabled === true) return true;
  if (job.paperwork?.dob?.enabled === true) return true;
  if (job.paperwork?.city?.enabled === true) return true;
  return false;
}

/**
 * Detect open (non-complete) Con Ed / DOB application data on a job.
 * Used to auto-open the pipe so Job Info + Paperwork panel + Permits stay linked.
 *
 * @returns {{ open: boolean, coned: boolean, dob: boolean, reasons: string[] }}
 */
export function detectOpenPermitApplication(job) {
  const reasons = [];
  let coned = false;
  let dob = false;
  if (!job) return { open: false, coned, dob, reasons };

  const c = job.paperwork?.coned || {};
  const d = job.paperwork?.dob || {};
  const city = job.paperwork?.city || {};

  // Con Ed: real open application only (case #, Form A, files, open todos).
  // Tracker seed stage alone does NOT auto-open — that would fight Progress toggles.
  if (c.caseNumber && !isPermitStageTerminal("coned", c.currentStage, c.stageBucket)) {
    coned = true;
    reasons.push("coned_case");
  }
  if (c.application && c.application.status !== "cancelled") {
    coned = true;
    reasons.push("coned_application");
  }
  if (Array.isArray(c.completedFiles) && c.completedFiles.length > 0) {
    // Files ready / uploaded — still open until meter_turn_on / cancelled
    if (!isPermitStageTerminal("coned", c.currentStage, c.stageBucket)) {
      coned = true;
      reasons.push("coned_files");
    }
  }
  if (Array.isArray(c.customerTodos) && c.customerTodos.some((t) => t && t.status !== "done")) {
    coned = true;
    reasons.push("coned_todos");
  }

  // DOB / city: real job/filing # still open (not complete)
  const dobJob =
    d.jobNumber || d.caseNumber || city.jobNumber || city.caseNumber || "";
  const dobStage = d.currentStage || city.currentStage || "";
  const dobBucket = d.stageBucket || city.stageBucket || "";
  if (dobJob && !isPermitStageTerminal("city", dobStage, dobBucket)) {
    dob = true;
    reasons.push("dob_job");
  }

  // Structured permits[] — real case / job # only (tracker seeds alone do not auto-open)
  for (const p of Array.isArray(job.permits) ? job.permits : []) {
    if (!p) continue;
    const a = String(p.agency || "").toLowerCase();
    if (a === "coned" || a === "con-ed") {
      if (
        (p.primaryKey || p.caseNumber) &&
        !isPermitStageTerminal("coned", p.currentStage, p.stageBucket)
      ) {
        coned = true;
        reasons.push("permit_coned");
      }
    }
    if (a === "city" || a === "dob") {
      if (
        (p.primaryKey || p.jobNumber || p.caseNumber) &&
        !isPermitStageTerminal("city", p.currentStage, p.stageBucket)
      ) {
        dob = true;
        reasons.push("permit_city");
      }
    }
  }

  return { open: coned || dob, coned, dob, reasons: [...new Set(reasons)] };
}

export function hasOpenPermitApplication(job) {
  return detectOpenPermitApplication(job).open;
}

/**
 * Deep-merge two permit patches (paperwork objects + permits arrays).
 * Later wins for scalars; permits[] is replaced when either side has it.
 */
function mergePipePatches(...patches) {
  const out = {};
  for (const p of patches) {
    if (!p || typeof p !== "object") continue;
    if (p.permitTracker !== undefined) out.permitTracker = p.permitTracker;
    if (p.status) out.status = { ...(out.status || {}), ...p.status };
    if (p.permits) out.permits = p.permits;
    if (p.paperwork) {
      out.paperwork = { ...(out.paperwork || {}) };
      for (const [k, v] of Object.entries(p.paperwork)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          out.paperwork[k] = { ...(out.paperwork[k] || {}), ...v };
        } else {
          out.paperwork[k] = v;
        }
      }
    }
  }
  return out;
}

/**
 * Job Information master valve — turns Con Ed + DOB tracker + Progress Paperwork on.
 * Same conduit used by the green Paperwork toggle.
 */
export function masterPipeTogglePatch(job, on = true) {
  if (!on) {
    return {
      permitTracker: false,
      paperwork: {
        coned: { enabled: false },
        dob: { enabled: false },
        city: { enabled: false },
        permitTracker: false,
      },
    };
  }
  const seed = setPermitTrackerPatch(job, true);
  const prevPaper = job?.status?.Paperwork?.s;
  const paperStatus =
    prevPaper === "done" || prevPaper === "skipped"
      ? job.status.Paperwork
      : { s: "done", d: todayStr() };
  return mergePipePatches(
    { permitTracker: true, status: { Paperwork: paperStatus } },
    seed,
    {
      paperwork: {
        ...(seed.paperwork || {}),
        coned: { ...(seed.paperwork?.coned || {}), enabled: true },
        dob: { ...(seed.paperwork?.dob || {}), enabled: true },
        city: { enabled: true },
        permitTracker: true,
      },
    }
  );
}

/**
 * Progress branch enable (Con Ed / DOB under Paperwork step) — same seed as master.
 * Keeps permits[] + stage chips in sync with Job Info + Permits tab.
 */
export function branchEnablePipePatch(job, branchKey, on = true) {
  const k = String(branchKey || "").toLowerCase();
  if (k === "coned") {
    if (!on) {
      return {
        paperwork: { coned: { enabled: false } },
        // Only clear master if DOB also off
        ...(job?.paperwork?.dob?.enabled ? {} : { permitTracker: false }),
      };
    }
    const seed = enableConedPermitTrackerPatch(job, true);
    const first =
      (job?.paperwork?.coned && Object.keys(job.paperwork.coned.active || {})[0]) ||
      "Application submitted";
    return mergePipePatches(seed, {
      permitTracker: true,
      paperwork: {
        coned: {
          ...(seed.paperwork?.coned || {}),
          enabled: true,
          active: { [first]: true },
        },
        permitTracker: true,
      },
    });
  }
  if (k === "dob" || k === "city") {
    if (!on) {
      return {
        paperwork: { dob: { enabled: false }, city: { enabled: false } },
        ...(job?.paperwork?.coned?.enabled ? {} : { permitTracker: false }),
      };
    }
    const seed = enableDobPermitTrackerPatch(job, true);
    const first =
      (job?.paperwork?.dob && Object.keys(job.paperwork.dob.active || {})[0]) || "Permit issued";
    return mergePipePatches(seed, {
      permitTracker: true,
      paperwork: {
        dob: {
          ...(seed.paperwork?.dob || {}),
          enabled: true,
          active: { [first]: true },
        },
        city: { enabled: true },
        permitTracker: true,
      },
    });
  }
  // Unknown branch — minimal enable only
  return { paperwork: { [k]: { enabled: !!on } } };
}

/**
 * When an open application already exists, open the pipe so all three surfaces
 * show it. Idempotent — returns null if already fully connected.
 *
 * Does not invent case numbers; only enables valves + seeds missing board rows.
 */
export function openApplicationPipePatch(job) {
  const det = detectOpenPermitApplication(job);
  if (!det.open) return null;

  // Already fully on and agencies that have data are enabled?
  const needConed = det.coned && job?.paperwork?.coned?.enabled !== true;
  const needDob = det.dob && job?.paperwork?.dob?.enabled !== true;
  const needTracker = job?.permitTracker !== true;
  const needPaperStatus =
    job?.status?.Paperwork?.s !== "done" && job?.status?.Paperwork?.s !== "skipped";

  if (!needConed && !needDob && !needTracker && !needPaperStatus) {
    // Still ensure permits[] seeds exist when board would otherwise miss the job
    const list = Array.isArray(job?.permits) ? job.permits : [];
    const hasConedPermit = list.some((p) => {
      const a = String(p?.agency || "").toLowerCase();
      return a === "coned" || a === "con-ed";
    });
    const hasCityPermit = list.some((p) => {
      const a = String(p?.agency || "").toLowerCase();
      return a === "city" || a === "dob";
    });
    if (det.coned && !hasConedPermit) {
      /* fall through to seed */
    } else if (det.dob && !hasCityPermit) {
      /* fall through to seed */
    } else {
      return null;
    }
  }

  const patches = [];
  patches.push({
    permitTracker: true,
    paperwork: { permitTracker: true },
  });
  if (needPaperStatus) {
    patches.push({ status: { Paperwork: { s: "done", d: todayStr() } } });
  }
  if (det.coned) {
    patches.push(enableConedPermitTrackerPatch(job, true));
  }
  // Apply coned first so dob seed merges permits on top
  let mid = job;
  if (det.coned) {
    const c = enableConedPermitTrackerPatch(job, true);
    mid = {
      ...job,
      paperwork: { ...(job?.paperwork || {}), ...(c.paperwork || {}) },
      permits: c.permits || job?.permits,
    };
  }
  if (det.dob) {
    patches.push(enableDobPermitTrackerPatch(mid, true));
  }
  // Force enabled true for agencies with open data
  const force = { paperwork: {} };
  if (det.coned) force.paperwork.coned = { enabled: true };
  if (det.dob) {
    force.paperwork.dob = { enabled: true };
    force.paperwork.city = { enabled: true };
  }
  patches.push(force);

  const merged = mergePipePatches(...patches);
  // Drop empty no-ops
  if (!merged || !Object.keys(merged).length) return null;
  return merged;
}

/**
 * Yearly city-permit renew schedule flag (data only — auto email OFF until launch).
 * Stored on paperwork.dob.renewSchedule and mirrored on city permit rows.
 *
 * @param {object} job
 * @param {{ on?: boolean, agency?: string }} opts
 */
export function renewSchedulePatch(job, { on = true, agency = "dob" } = {}) {
  const a = String(agency || "dob").toLowerCase();
  const isCity = a === "dob" || a === "city";
  const record = {
    on: !!on,
    updatedAt: new Date().toISOString(),
    // Auto email stays off until Levi launches (spec 2026-08-06)
    autoEmail: false,
  };
  const paperwork = isCity
    ? { dob: { renewSchedule: record }, city: { renewSchedule: record } }
    : { coned: { renewSchedule: record } };

  const list = Array.isArray(job?.permits) ? job.permits.map((p) => ({ ...p })) : [];
  let permitsChanged = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const pa = String(p?.agency || "").toLowerCase();
    const match = isCity
      ? pa === "city" || pa === "dob"
      : pa === "coned" || pa === "con-ed";
    if (!match) continue;
    list[i] = { ...p, renewSchedule: record };
    permitsChanged = true;
  }

  const patch = { paperwork };
  if (permitsChanged) patch.permits = list;
  return patch;
}

/** Read renew schedule ON/OFF for an agency (defaults false). */
export function getRenewSchedule(job, agency = "dob") {
  const a = String(agency || "dob").toLowerCase();
  if (a === "dob" || a === "city") {
    const r =
      job?.paperwork?.dob?.renewSchedule ||
      job?.paperwork?.city?.renewSchedule ||
      null;
    if (r && typeof r === "object") return !!r.on;
    const list = Array.isArray(job?.permits) ? job.permits : [];
    const hit = list.find((p) => {
      const pa = String(p?.agency || "").toLowerCase();
      return (pa === "city" || pa === "dob") && p?.renewSchedule;
    });
    return !!(hit?.renewSchedule?.on);
  }
  const r = job?.paperwork?.coned?.renewSchedule;
  return !!(r && r.on);
}

export {
  isOnPermitTracker,
  setPermitTrackerPatch,
  enableConedPermitTrackerPatch,
  enableDobPermitTrackerPatch,
};
