// Seed a job onto the Permits tab when Levi turns on the permit tracker.
// Turning on Con Ed / DOB paperwork (or the Job Info "Permit tracker" toggle)
// must create a board row even before a case # exists — otherwise the job
// never appears on Permits (Levi 2026-08-05 · 1202 Carroll Street).

import { CONED_STAGE_LABELS, STAGE_BUCKET, stageHealth, mergePermitList } from "./conedPermit.js";
import { CITY_STAGE_LABELS, CITY_STAGE_BUCKET, cityStageHealth } from "./cityPermit.js";

function jobAddress(job) {
  return String(job?.serviceAddress || job?.address || job?.location || "").trim();
}

/** True when this job already has a Con Ed / city permit board presence. */
export function isOnPermitTracker(job) {
  if (!job) return false;
  if (job.permitTracker === true) return true;
  if (job.paperwork?.coned?.enabled === true) return true;
  if (job.paperwork?.dob?.enabled === true) return true;
  if (job.paperwork?.permitTracker === true) return true;
  const list = Array.isArray(job.permits) ? job.permits : [];
  return list.some((p) => {
    const a = String(p?.agency || "").toLowerCase();
    return a === "coned" || a === "city" || a === "dob";
  });
}

/**
 * Patch when enabling Con Ed paperwork: keep real case data, seed tracker otherwise.
 * @param {object} job
 * @param {boolean} on
 */
export function enableConedPermitTrackerPatch(job, on = true) {
  if (!on) {
    return { paperwork: { coned: { enabled: false } } };
  }
  const prev = job?.paperwork?.coned || {};
  const addr = jobAddress(job);
  const hasCase = !!(prev.caseNumber || prev.currentStage);
  const coned = {
    enabled: true,
    ...(hasCase
      ? {}
      : {
          currentStage: "application_filed",
          stageLabel: "On permit tracker",
          stageBucket: "Open",
          health: "ok",
          nextAction: prev.nextAction || "Submit application or link a case number",
          nextActionDate: prev.nextActionDate || "",
        }),
  };
  // Seed structured permit so board + emails can update it later.
  let permits;
  if (!hasCase) {
    const seed = {
      agency: "coned",
      id: `track-coned-${job?.id || "new"}`,
      primaryKey: "",
      addressNormalized: addr,
      currentStage: "application_filed",
      stageLabel: CONED_STAGE_LABELS.application_filed || "On permit tracker",
      stageBucket: STAGE_BUCKET.application_filed || "Open",
      health: stageHealth("application_filed"),
      nextAction: "Submit application or link a case number",
      nextActionDate: "",
      updatedAt: new Date().toISOString(),
      source: "tracker_seed",
    };
    // Only add seed if no coned permit already exists
    const list = Array.isArray(job?.permits) ? job.permits : [];
    const hasConed = list.some((p) => String(p?.agency || "").toLowerCase() === "coned");
    if (!hasConed) permits = mergePermitList(list, seed);
  }
  const patch = { paperwork: { coned } };
  if (permits) patch.permits = permits;
  return patch;
}

/**
 * Patch when enabling DOB / City paperwork: seed city permit for the board.
 * City board rows only come from permits[] (not paperwork.dob alone).
 */
export function enableDobPermitTrackerPatch(job, on = true) {
  if (!on) {
    return { paperwork: { dob: { enabled: false } } };
  }
  const prev = job?.paperwork?.dob || {};
  const addr = jobAddress(job);
  const list = Array.isArray(job?.permits) ? job.permits : [];
  const hasCity = list.some((p) => {
    const a = String(p?.agency || "").toLowerCase();
    return a === "city" || a === "dob";
  });
  const patch = {
    paperwork: {
      dob: {
        enabled: true,
        ...(prev.caseNumber || prev.currentStage
          ? {}
          : {
              currentStage: "filing_submitted",
              stageLabel: "On permit tracker",
              stageBucket: "Open",
              health: "ok",
              nextAction: prev.nextAction || "File electrical permit or add DOB job #",
            }),
      },
    },
  };
  if (!hasCity) {
    const seed = {
      agency: "city",
      id: `track-dob-${job?.id || "new"}`,
      primaryKey: "",
      addressNormalized: addr,
      currentStage: "filing_submitted",
      stageLabel: CITY_STAGE_LABELS.filing_submitted || "On permit tracker",
      stageBucket: CITY_STAGE_BUCKET.filing_submitted || "Open",
      health: cityStageHealth("filing_submitted"),
      nextAction: "File electrical permit or add DOB job #",
      nextActionDate: "",
      updatedAt: new Date().toISOString(),
      source: "tracker_seed",
    };
    // Merge on top of any coned seeds already computed in a combined patch
    patch.permits = mergePermitList(list, seed);
  }
  return patch;
}

/**
 * One toggle: put the job on the permit tracker (Con Ed + DOB) so it shows on Permits.
 * Used by Job Information "Permit tracker" switch.
 */
export function setPermitTrackerPatch(job, on = true) {
  if (!on) {
    return {
      paperwork: {
        coned: { enabled: false },
        dob: { enabled: false },
      },
    };
  }
  const coned = enableConedPermitTrackerPatch(job, true);
  // Apply coned permits first so dob seed merges on top
  const mid = {
    ...job,
    paperwork: { ...(job?.paperwork || {}), ...(coned.paperwork || {}) },
    permits: coned.permits || job?.permits,
  };
  const dob = enableDobPermitTrackerPatch(mid, true);
  const permits = dob.permits || coned.permits;
  return {
    paperwork: {
      ...(coned.paperwork || {}),
      ...(dob.paperwork || {}),
    },
    ...(permits ? { permits } : {}),
  };
}
