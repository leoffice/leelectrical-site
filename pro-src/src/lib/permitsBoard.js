// Permits board — cross-job Con Edison + City/DOB case list.
//
// Pure functions only (no network, no React). The Permits view feeds these
// `jobs` + `emailInsights` + tenant `config` and renders the returned board.
//
// TWO data paths, on purpose:
//   1. PERSISTED — a job that already carries `permits[]` / `paperwork.coned`
//      (written by applyEmailInsight when an email is approved, or by the
//      backfill in permitBackfill.js).
//   2. DERIVED — for jobs that don't yet carry that, we fold the applied
//      Con Ed insights through the SAME brain (conedPatchFromInsight) IN
//      MEMORY. This is why the tab shows real data on day one without having
//      to mutate anything first: opening the tab is side-effect free.
//
// City/DOB (DOB NOW: Electrical) now has a real lifecycle brain too
// (cityPermit.js, WP-Permits-B) — folded the same way as Con Ed, producing
// staged `agency:"city"` permit records instead of the old read-only projection.

import {
  conedPatchFromInsight,
  isConedAgencyInsight,
  STAGE_BUCKET,
  stageHealth,
  CONED_STAGE_LABELS,
} from "./conedPermit.js";
import {
  cityPatchFromInsight,
  isCityAgencyInsight,
  CITY_STAGE_LABELS,
  CITY_STAGE_BUCKET,
  cityStageHealth,
} from "./cityPermit.js";

/** An insight counts as "on the job" once it was approved or auto-applied. */
export function isAppliedInsight(insight) {
  const st = String(insight?.status || "").toLowerCase();
  return st === "approved" || st === "auto_applied" || st === "applied";
}

/** Canonical agency buckets. City and DOB collapse to one ("dob"). */
const AGENCY_ALIASES = {
  coned: "coned",
  "con-ed": "coned",
  energy: "coned",
  city: "dob",
  dob: "dob",
  "dob-now": "dob",
};
export function canonAgency(a) {
  const k = String(a || "").toLowerCase();
  return AGENCY_ALIASES[k] || k;
}

/** Fallback labels when the tenant config doesn't name the agency. */
const FALLBACK_AGENCY_LABEL = { coned: "Con Edison", dob: "City / DOB" };

/** Resolve a display label for an agency, preferring the tenant's own presets. */
export function agencyLabel(config, agencyId) {
  const canon = canonAgency(agencyId);
  const presets = Array.isArray(config?.agencies) ? config.agencies : [];
  const hit = presets.find((p) => canonAgency(p.id) === canon || canonAgency(p.label) === canon);
  return (hit && hit.label) || FALLBACK_AGENCY_LABEL[canon] || agencyId || "Permits";
}

/** Section order: the tenant's configured agencies first, then anything else seen. */
export function agencyOrder(config, seen = []) {
  const presets = (Array.isArray(config?.agencies) ? config.agencies : []).map((p) => canonAgency(p.id));
  const order = [];
  for (const a of presets) if (!order.includes(a)) order.push(a);
  // Default NYC pair so an unconfigured internal tenant still sees both.
  for (const a of ["coned", "dob"]) if (!order.includes(a)) order.push(a);
  for (const a of seen) if (!order.includes(canonAgency(a))) order.push(canonAgency(a));
  return order;
}

function jobName(job) {
  return (
    String(job?.customer || job?.businessName || job?.personName || "").trim() ||
    job?.title ||
    "Unknown customer"
  );
}
function jobAddress(job) {
  return String(job?.serviceAddress || job?.address || job?.location || "").trim();
}

function receivedTs(insight) {
  const r = insight?.source?.receivedAt || insight?.receivedAt || "";
  const t = Date.parse(r);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Fold every applied Con Ed insight for one job through the brain, on top of
 * whatever the job already persists. Returns the merged permits[] + the
 * paperwork.coned summary. Deterministic and side-effect free.
 */
export function foldConedForJob(job, insights) {
  let permits = Array.isArray(job?.permits) ? job.permits.map((p) => ({ ...p })) : [];
  let paperConed = job?.paperwork?.coned ? { ...job.paperwork.coned } : undefined;

  const applied = (insights || [])
    .filter(isAppliedInsight)
    .filter((i) => isConedAgencyInsight(i) || i?.agency === "coned")
    .sort((a, b) => receivedTs(a) - receivedTs(b));

  for (const ins of applied) {
    const synthJob = {
      ...job,
      permits,
      paperwork: { ...(job?.paperwork || {}), coned: paperConed },
    };
    const patch = conedPatchFromInsight(ins, synthJob);
    if (!patch) continue;
    permits = patch.permits || permits;
    if (patch.paperwork?.coned) paperConed = { ...(paperConed || {}), ...patch.paperwork.coned };
  }
  return { permits, paperConed };
}

/** Build a display row from a persisted/derived Con Ed permit record. */
function rowFromConedPermit(job, permit) {
  const stage = permit.currentStage || "";
  return {
    key: `coned:${permit.primaryKey || permit.id || job.id}`,
    agency: "coned",
    jobId: job.id,
    jobName: jobName(job),
    address: permit.addressNormalized || jobAddress(job),
    caseNumber: permit.primaryKey || "",
    stage,
    stageLabel: CONED_STAGE_LABELS[stage] || permit.stageLabel || stage || "Open case",
    stageBucket: permit.stageBucket || STAGE_BUCKET[stage] || "Open",
    health: permit.health || stageHealth(stage),
    nextAction: permit.nextAction || "",
    nextActionDate: permit.nextActionDate || "",
    updatedAt: permit.updatedAt || "",
    source: "coned",
  };
}

/** Row from a paperwork.coned summary when there's no structured permit record. */
function rowFromConedPaperwork(job, coned) {
  const stage = coned.currentStage || "";
  return {
    key: `coned:${coned.caseNumber || job.id}`,
    agency: "coned",
    jobId: job.id,
    jobName: jobName(job),
    address: jobAddress(job),
    caseNumber: coned.caseNumber || "",
    stage,
    stageLabel: coned.stageLabel || CONED_STAGE_LABELS[stage] || "Open case",
    stageBucket: coned.stageBucket || STAGE_BUCKET[stage] || "Open",
    health: coned.health || stageHealth(stage),
    nextAction: coned.nextAction || "",
    nextActionDate: coned.nextActionDate || "",
    updatedAt: "",
    source: "coned",
  };
}

/**
 * Fold every applied City / DOB NOW insight for one job through the city brain,
 * on top of whatever the job already persists. Mirror of foldConedForJob.
 */
export function foldCityForJob(job, insights) {
  let permits = Array.isArray(job?.permits) ? job.permits.map((p) => ({ ...p })) : [];
  const applied = (insights || [])
    .filter(isAppliedInsight)
    .filter((i) => isCityAgencyInsight(i))
    .sort((a, b) => receivedTs(a) - receivedTs(b));
  for (const ins of applied) {
    const synthJob = { ...job, permits };
    const patch = cityPatchFromInsight(ins, synthJob);
    if (!patch) continue;
    permits = patch.permits || permits;
  }
  return { permits };
}

/** Display row from a City/DOB permit record. */
function rowFromCityPermit(job, permit) {
  const stage = permit.currentStage || "";
  return {
    key: `dob:${permit.primaryKey || permit.id || job.id}`,
    agency: "dob",
    jobId: job.id,
    jobName: jobName(job),
    address: permit.addressNormalized || jobAddress(job),
    caseNumber: permit.primaryKey || "",
    stage,
    stageLabel: CITY_STAGE_LABELS[stage] || permit.stageLabel || stage || "Open filing",
    stageBucket: permit.stageBucket || CITY_STAGE_BUCKET[stage] || "Open",
    health: permit.health || cityStageHealth(stage),
    nextAction: permit.nextAction || "",
    nextActionDate: permit.nextActionDate || "",
    updatedAt: permit.updatedAt || "",
    source: "city",
  };
}

/** Health/bucket → does this case need us to do something? */
export function isActionNeeded(row) {
  if (!row) return false;
  if (row.health === "blocked-by-us" || row.health === "at-risk") return true;
  return row.stageBucket === "Waiting-on-us" || row.stageBucket === "At-risk";
}

const HEALTH_PRIORITY = { "blocked-by-us": 0, "at-risk": 1, ok: 2 };
const BUCKET_PRIORITY = {
  "At-risk": 0,
  "Waiting-on-us": 1,
  Open: 2,
  Scheduled: 3,
  Passed: 4,
  Terminal: 5,
};

/** Sort: most-urgent first (health, then bucket, then soonest next-action date). */
export function comparePermitRows(a, b) {
  const ha = HEALTH_PRIORITY[a.health] ?? 2;
  const hb = HEALTH_PRIORITY[b.health] ?? 2;
  if (ha !== hb) return ha - hb;
  const ba = BUCKET_PRIORITY[a.stageBucket] ?? 2;
  const bb = BUCKET_PRIORITY[b.stageBucket] ?? 2;
  if (ba !== bb) return ba - bb;
  const da = Date.parse(a.nextActionDate || "") || Infinity;
  const db = Date.parse(b.nextActionDate || "") || Infinity;
  if (da !== db) return da - db;
  return String(a.jobName).localeCompare(String(b.jobName));
}

/**
 * The whole board. Returns:
 *   { sections: [{ agency, label, cases: [...] }], actionNeeded: [...], counts }
 *
 * `counts` = { total, open, actionNeeded, scheduled, passed } for the header.
 */
export function buildPermitBoard({ jobs = [], insights = [], config = null } = {}) {
  const jobById = new Map();
  for (const j of jobs) if (j && j.id) jobById.set(j.id, j);

  // Which jobs even have Con Ed data to consider: persisted, or an applied
  // Con Ed insight pointing at them. Keeps us off the full 4k-job list.
  const conedInsights = (insights || [])
    .filter(isAppliedInsight)
    .filter((i) => isConedAgencyInsight(i) || i?.agency === "coned");
  const insightsByJob = new Map();
  for (const ins of conedInsights) {
    if (!ins.jobId) continue;
    if (!insightsByJob.has(ins.jobId)) insightsByJob.set(ins.jobId, []);
    insightsByJob.get(ins.jobId).push(ins);
  }

  const candidateJobIds = new Set(insightsByJob.keys());
  for (const j of jobs) {
    if (!j || !j.id) continue;
    const hasPermit = Array.isArray(j.permits) && j.permits.some((p) => canonAgency(p.agency) === "coned");
    const hasPaper = j.paperwork?.coned && (j.paperwork.coned.caseNumber || j.paperwork.coned.currentStage);
    if (hasPermit || hasPaper) candidateJobIds.add(j.id);
  }

  const conedByKey = new Map();
  for (const jobId of candidateJobIds) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const folded = foldConedForJob(job, insightsByJob.get(jobId) || []);
    const conedPermits = (folded.permits || []).filter((p) => canonAgency(p.agency) === "coned");
    if (conedPermits.length) {
      for (const permit of conedPermits) {
        const row = rowFromConedPermit(job, permit);
        conedByKey.set(row.key, row);
      }
    } else if (folded.paperConed && (folded.paperConed.caseNumber || folded.paperConed.currentStage)) {
      const row = rowFromConedPaperwork(job, folded.paperConed);
      conedByKey.set(row.key, row);
    }
  }
  const conedCases = [...conedByKey.values()].sort(comparePermitRows);

  // City / DOB — same fold pattern as Con Ed (real stage brain, WP-Permits-B).
  const cityInsights = (insights || []).filter(isAppliedInsight).filter((i) => isCityAgencyInsight(i));
  const cityByJob = new Map();
  for (const ins of cityInsights) {
    if (!ins.jobId) continue;
    if (!cityByJob.has(ins.jobId)) cityByJob.set(ins.jobId, []);
    cityByJob.get(ins.jobId).push(ins);
  }
  const cityCandidates = new Set(cityByJob.keys());
  for (const j of jobs) {
    if (!j || !j.id) continue;
    if (Array.isArray(j.permits) && j.permits.some((p) => canonAgency(p.agency) === "dob")) cityCandidates.add(j.id);
  }
  const cityByKey = new Map();
  for (const jobId of cityCandidates) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const folded = foldCityForJob(job, cityByJob.get(jobId) || []);
    for (const permit of (folded.permits || []).filter((p) => canonAgency(p.agency) === "dob")) {
      const row = rowFromCityPermit(job, permit);
      cityByKey.set(row.key, row);
    }
  }
  const cityCases = [...cityByKey.values()].sort(comparePermitRows);

  const byAgency = { coned: conedCases, dob: cityCases };
  const seen = Object.keys(byAgency).filter((a) => byAgency[a].length);
  const order = agencyOrder(config, seen);

  const sections = order
    .map((agency) => ({
      agency,
      label: agencyLabel(config, agency),
      cases: byAgency[agency] || [],
    }))
    // Show a configured agency even when empty; drop unknown empties.
    .filter((s) => s.cases.length || ["coned", "dob"].includes(s.agency));

  const all = [...conedCases, ...cityCases];
  const actionNeeded = all.filter(isActionNeeded).sort(comparePermitRows);
  const counts = {
    total: all.length,
    actionNeeded: actionNeeded.length,
    open: all.filter((r) => r.stageBucket === "Open").length,
    scheduled: all.filter((r) => r.stageBucket === "Scheduled").length,
    passed: all.filter((r) => r.stageBucket === "Passed").length,
  };

  return { sections, actionNeeded, counts };
}
