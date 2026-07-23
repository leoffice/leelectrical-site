// Con Ed backfill — persist what the board already derives in memory.
//
// The Permits board folds applied Con Ed insights through the brain for
// display without writing anything. This module takes that same fold and
// PERSISTS it onto the jobs (paperwork.coned + permits[]), so:
//   - the per-job Con Ed stage chip in JobDetail also lights up, and
//   - future email applies build on a real permit record instead of re-deriving.
//
// It is idempotent: a job is only patched when the folded result actually
// differs from what the job already stores. Running it twice is a no-op.

import { foldConedForJob, foldCityForJob, isAppliedInsight, canonAgency } from "./permitsBoard.js";
import { isConedAgencyInsight } from "./conedPermit.js";
import { isCityAgencyInsight } from "./cityPermit.js";

/** The fields that decide whether a Con Ed permit is "the same" for idempotency. */
function permitFingerprint(list) {
  return (Array.isArray(list) ? list : [])
    .filter((p) => canonAgency(p.agency) === "coned")
    .map((p) => `${p.primaryKey || p.id}|${p.currentStage}|${p.stageBucket}|${p.health}|${p.nextAction}`)
    .sort()
    .join("~~");
}
function paperFingerprint(coned) {
  if (!coned) return "";
  return [coned.caseNumber, coned.currentStage, coned.stageBucket, coned.health, coned.nextAction]
    .map((x) => x || "")
    .join("|");
}

/**
 * Which jobs would change, and by what patch. Pure — no writes.
 * @returns Array<{ jobId, jobName, patch, caseNumber, stageLabel }>
 */
export function computeConedBackfill({ jobs = [], insights = [] } = {}) {
  const applied = (insights || [])
    .filter(isAppliedInsight)
    .filter((i) => (isConedAgencyInsight(i) || i?.agency === "coned") && i.jobId);
  const byJob = new Map();
  for (const ins of applied) {
    if (!byJob.has(ins.jobId)) byJob.set(ins.jobId, []);
    byJob.get(ins.jobId).push(ins);
  }

  const jobById = new Map();
  for (const j of jobs) if (j && j.id) jobById.set(j.id, j);

  const out = [];
  for (const [jobId, jobInsights] of byJob) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const folded = foldConedForJob(job, jobInsights);
    if (!folded.paperConed && !(folded.permits || []).some((p) => canonAgency(p.agency) === "coned")) {
      continue; // nothing Con Ed came out of it
    }

    const beforePermits = permitFingerprint(job.permits);
    const afterPermits = permitFingerprint(folded.permits);
    const beforePaper = paperFingerprint(job.paperwork?.coned);
    const afterPaper = paperFingerprint(folded.paperConed);
    if (beforePermits === afterPermits && beforePaper === afterPaper) continue; // idempotent no-op

    out.push({
      jobId,
      jobName: job.customer || job.title || jobId,
      caseNumber: folded.paperConed?.caseNumber || "",
      stageLabel: folded.paperConed?.stageLabel || "",
      patch: {
        permits: folded.permits,
        paperwork: { coned: folded.paperConed },
      },
    });
  }
  return out;
}

/**
 * Persist the Con Ed backfill. `patchJob(id, patch)` is the overlay writer.
 * Returns { changed, jobs: [...] }.
 */
export async function applyConedBackfill({ jobs = [], insights = [], patchJob } = {}) {
  const plan = computeConedBackfill({ jobs, insights });
  if (typeof patchJob !== "function") return { changed: 0, jobs: plan.map((p) => p.jobId) };
  for (const item of plan) {
    await patchJob(item.jobId, item.patch);
  }
  return { changed: plan.length, jobs: plan.map((p) => p.jobId) };
}

/** Fingerprint of ALL permits (both agencies) — for combined idempotency. */
function allPermitsFingerprint(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => `${canonAgency(p.agency)}:${p.primaryKey || p.id}|${p.currentStage}|${p.stageBucket}|${p.health}|${p.nextAction}`)
    .sort()
    .join("~~");
}

/**
 * Combined Con Ed + City/DOB backfill. Folds BOTH agencies into ONE unified
 * `permits[]` per job (city fold chained on top of the coned fold) so the two
 * never clobber each other when saved (arrays replace, not merge). Also keeps
 * `paperwork.coned` for the JobDetail chip. Pure — no writes.
 * @returns Array<{ jobId, jobName, patch, coned, city }>
 */
export function computePermitBackfill({ jobs = [], insights = [] } = {}) {
  const applied = (insights || []).filter(isAppliedInsight).filter((i) => i.jobId);
  const conedByJob = new Map();
  const cityByJob = new Map();
  for (const ins of applied) {
    if (isConedAgencyInsight(ins) || ins.agency === "coned") {
      if (!conedByJob.has(ins.jobId)) conedByJob.set(ins.jobId, []);
      conedByJob.get(ins.jobId).push(ins);
    }
    if (isCityAgencyInsight(ins)) {
      if (!cityByJob.has(ins.jobId)) cityByJob.set(ins.jobId, []);
      cityByJob.get(ins.jobId).push(ins);
    }
  }
  const jobById = new Map();
  for (const j of jobs) if (j && j.id) jobById.set(j.id, j);

  const jobIds = new Set([...conedByJob.keys(), ...cityByJob.keys()]);
  const out = [];
  for (const jobId of jobIds) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const conedFold = foldConedForJob(job, conedByJob.get(jobId) || []);
    // Chain: city fold starts from the coned-folded permits so both survive.
    const cityFold = foldCityForJob({ ...job, permits: conedFold.permits }, cityByJob.get(jobId) || []);
    const unified = cityFold.permits || conedFold.permits || [];

    const hasConed = unified.some((p) => canonAgency(p.agency) === "coned") || conedFold.paperConed;
    const hasCity = unified.some((p) => canonAgency(p.agency) === "dob");
    if (!hasConed && !hasCity) continue;

    if (
      allPermitsFingerprint(job.permits) === allPermitsFingerprint(unified) &&
      paperFingerprint(job.paperwork?.coned) === paperFingerprint(conedFold.paperConed)
    ) {
      continue; // idempotent no-op
    }

    const patch = { permits: unified };
    if (conedFold.paperConed) patch.paperwork = { coned: conedFold.paperConed };
    out.push({
      jobId,
      jobName: job.customer || job.title || jobId,
      coned: conedFold.paperConed?.caseNumber || "",
      city: unified.filter((p) => canonAgency(p.agency) === "dob").map((p) => p.primaryKey).filter(Boolean)[0] || "",
      patch,
    });
  }
  return out;
}

/** Persist the combined Con Ed + City backfill. */
export async function applyPermitBackfill({ jobs = [], insights = [], patchJob } = {}) {
  const plan = computePermitBackfill({ jobs, insights });
  if (typeof patchJob !== "function") return { changed: 0, jobs: plan.map((p) => p.jobId) };
  for (const item of plan) {
    await patchJob(item.jobId, item.patch);
  }
  return { changed: plan.length, jobs: plan.map((p) => p.jobId) };
}
