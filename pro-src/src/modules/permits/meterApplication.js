/**
 * Submit Meter Application — first live Con Ed sub-workflow (spec §5.3).
 *
 * Four Energy Services field options (literal labels Levi sees on portal):
 *  1. Not required
 *  2. Not needed for this job
 *  3. A new meter
 *  4. A new application
 *
 * Stored on job.paperwork.coned.meterApplication and mirrored onto the linked
 * Con Ed permit record when present (one-to-one job ↔ permit).
 * New meter / new application also enter the Permits Deploy queue and attach
 * to an active case number when one already exists on the job.
 */
import { addPaperworkTodoPatch } from "../../lib/agencyForms/paperworkTodos.js";

/** Canonical value keys (stable for storage + tests). */
export const METER_APPLICATION_VALUES = Object.freeze([
  "not_required",
  "not_needed",
  "new_meter",
  "new_application",
]);

/** UI options: value + human label matching Energy Services wording. */
export const METER_APPLICATION_OPTIONS = Object.freeze([
  { value: "not_required", label: "Not required" },
  { value: "not_needed", label: "Not needed for this job" },
  { value: "new_meter", label: "A new meter" },
  { value: "new_application", label: "A new application" },
]);

const LABEL_BY_VALUE = Object.fromEntries(
  METER_APPLICATION_OPTIONS.map((o) => [o.value, o.label])
);

export function isValidMeterApplication(value) {
  return METER_APPLICATION_VALUES.includes(String(value || ""));
}

export function meterApplicationLabel(value) {
  const v = String(value || "");
  return LABEL_BY_VALUE[v] || "";
}

/**
 * Read current meter-application selection from a job (or permit-like object).
 * Prefers paperwork.coned, then permit.meterApplication, then null.
 */
export function getMeterApplication(jobOrPermit) {
  if (!jobOrPermit || typeof jobOrPermit !== "object") return null;
  const fromPw = jobOrPermit.paperwork?.coned?.meterApplication;
  if (fromPw && isValidMeterApplication(fromPw.value)) {
    return normalizeRecord(fromPw);
  }
  const fromPermit = jobOrPermit.meterApplication;
  if (fromPermit && isValidMeterApplication(fromPermit.value)) {
    return normalizeRecord(fromPermit);
  }
  // Permits array on job
  const permits = Array.isArray(jobOrPermit.permits) ? jobOrPermit.permits : [];
  const coned = permits.find((p) => p && p.agency === "coned");
  if (coned?.meterApplication && isValidMeterApplication(coned.meterApplication.value)) {
    return normalizeRecord(coned.meterApplication);
  }
  return null;
}

function normalizeRecord(raw) {
  const value = String(raw.value || "");
  return {
    value,
    label: raw.label || meterApplicationLabel(value),
    setAt: raw.setAt || "",
    source: raw.source || "manual",
  };
}

/**
 * Build the meterApplication record object (does not write).
 * @param {string} value - one of METER_APPLICATION_VALUES
 * @param {{ at?: string, source?: string }} [opts]
 */
export function recordMeterApplication(value, opts = {}) {
  if (!isValidMeterApplication(value)) {
    throw new Error("Invalid meter application option: " + value);
  }
  return {
    value: String(value),
    label: meterApplicationLabel(value),
    setAt: opts.at || new Date().toISOString(),
    source: opts.source || "manual",
  };
}

/**
 * Job patch: record meter application on Con Ed paperwork + linked permit list.
 * Safe to merge with existing patchJob deep-merge of paperwork.coned.
 * New meter / new application also enters the Permits Deploy queue and attaches
 * to an active Con Ed case number when one is already on the job.
 *
 * @param {object|null} job - existing job (for permits list merge)
 * @param {string} value - option key
 * @param {{ at?: string, source?: string }} [opts]
 * @returns {{ paperwork: object, permits?: array }}
 */
export function jobPatchMeterApplication(job, value, opts = {}) {
  const rec = recordMeterApplication(value, opts);
  const existingList = Array.isArray(job?.permits) ? job.permits : [];
  const patch = {
    paperwork: {
      coned: {
        enabled: true,
        meterApplication: rec,
      },
    },
  };

  if (existingList.length > 0) {
    const list = existingList.map((p) => {
      if (!p || p.agency !== "coned") return p;
      return { ...p, meterApplication: rec };
    });
    // If no coned permit yet, leave list as-is (paperwork carries the field)
    const hasConed = list.some((p) => p && p.agency === "coned");
    if (hasConed) patch.permits = list;
  }

  // Deploy queue: only when we have enough info to actually deploy (Levi 2026-08-03).
  // Tapping Electric / New Meter alone must NOT fill the Deploy queue.
  if (value === "new_meter" || value === "new_application") {
    const caseNumber = String(
      job?.paperwork?.coned?.caseNumber ||
        job?.paperwork?.coned?.createCase?.execution?.caseNumber ||
        ""
    ).trim();
    const addr = String(job?.serviceAddress || job?.address || "").trim();
    const formA =
      Array.isArray(job?.paperwork?.coned?.completedFiles) &&
      job.paperwork.coned.completedFiles.length > 0;
    const ready =
      !!addr &&
      (!!caseNumber ||
        formA ||
        job?.paperwork?.coned?.application?.status === "submitted" ||
        job?.paperwork?.coned?.meterDeploy?.formAReady === true);
    patch.paperwork.coned = {
      ...patch.paperwork.coned,
      meterApplication: rec,
      meterDeploy: {
        value,
        status: ready ? "deploy_queued" : "pending_info",
        caseNumber: caseNumber || "",
        attached: !!caseNumber,
        queuedAt: ready ? new Date().toISOString() : "",
        note: ready
          ? caseNumber
            ? `Attach to active case ${caseNumber}`
            : "Ready to deploy"
          : "Waiting for case / Form A / address before Deploy queue",
      },
      ...(caseNumber ? { caseNumber } : {}),
    };
    if (ready) {
      const title = ["New Meter", "Con Edison", addr].filter(Boolean).join(" · ");
      const { patch: todoPatch } = addPaperworkTodoPatch(job, {
        kind: "new_meter",
        meterLabel: value === "new_meter" ? "New Meter" : "New Application",
        title,
        note: caseNumber
          ? `Attach to active case ${caseNumber}`
          : "Ready for Deploy",
        source: "meter_application",
      });
      if (todoPatch?.paperwork?.todos) {
        patch.paperwork.todos = todoPatch.paperwork.todos;
      }
    }
  }

  return patch;
}
