/**
 * Permits Deploy queue — titles, deploy types, and next-step wiring.
 *
 * Levi (2026-08-03 evening): No top-level Deploy chooser. Applications land in
 * the Deploy queue (from job paperwork / questionnaires). Expand a row → Open /
 * Job / Edit + green Deploy. Deploy → "Deploying…" → when complete the row is
 * removed. Completed steps update job + paperwork and ready next step
 * (Electrical Permit when due).
 */
import {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  normalizeRequestType,
} from "./agencyForms/createCaseQuestionnaire.js";
import { getMeterApplication } from "../modules/permits/meterApplication.js";
import { getCreateCaseState } from "./agencyForms/createCaseExecution.js";
import {
  addPaperworkTodoPatch,
  listPaperworkTodos,
  paperworkTodoLabel,
} from "./agencyForms/paperworkTodos.js";
import {
  jobStatusPatchFromPermitStage,
} from "./permitProgressBridge.js";
import { listConedCompletedFiles } from "./agencyForms/completeDestinations.js";

const s = (v) => (v == null ? "" : String(v).trim());

/**
 * Whether the job already has a completed Con Ed Form A (application) on the
 * Con Edison Application tab — required before Deploying a PLP / new meter
 * into Project Center (Levi 2026-08-03).
 */
export function jobHasConedFormA(job = {}) {
  const files = listConedCompletedFiles(job);
  if (files.length > 0) return true;
  const ma = getMeterApplication(job);
  // Explicit "application completed" flag on meter app flow
  if (job?.paperwork?.coned?.meterDeploy?.formAReady === true) return true;
  if (job?.paperwork?.coned?.application?.status === "submitted") return true;
  // Draft create-case answers alone are NOT a finished Form A
  void ma;
  return false;
}

/** Canonical Con Ed case number on a job (any paperwork slot). */
export function jobConedCaseNumber(job = {}) {
  return (
    s(job?.paperwork?.coned?.caseNumber) ||
    s(job?.paperwork?.coned?.createCase?.execution?.caseNumber) ||
    s(job?.paperwork?.coned?.meterDeploy?.caseNumber) ||
    s(job?.paperwork?.coned?.createCase?.caseNumber) ||
    ""
  );
}

/**
 * What is still missing before Deploy is honest about readiness.
 * Levi 2026-08-04: never put a row in queue as "Ready" without this; surface
 * missing Form A / address / details with a fix path.
 *
 * @returns {{ ready: boolean, missing: Array<{ id: string, label: string, fix: string }> }}
 */
export function getDeployReadiness(job = {}, { kind = "new_meter" } = {}) {
  const missing = [];
  const k = s(kind).toLowerCase() || "new_meter";
  const addr = s(job?.serviceAddress || job?.address);
  if (!addr) {
    missing.push({
      id: "service_address",
      label: "Service address",
      fix: "job",
    });
  }
  const caseNumber = jobConedCaseNumber(job);
  const hasFormA = jobHasConedFormA(job);
  const draft = getCreateCaseState(job);
  const rt = s(draft?.answers?.requestType || draft?.payload?.requestType);
  const st = s(draft?.status).toLowerCase();

  if (k === "new_case" || k === "create_case") {
    if (!rt && st !== "ready_to_fill" && st !== "queued" && st !== "in_progress") {
      missing.push({
        id: "request_type",
        label: "Request type (Additional Load / No Additional Load)",
        fix: "edit_application",
      });
    }
    // Soft: full questionnaire validated at Deploy; list top blockers when draft exists
    if (rt && draft?.answers) {
      try {
        // Dynamic import avoided — use createCaseReady via getCreateCaseState fields only
        const a = draft.answers || {};
        if (!s(a.bin) && !s(a.borough)) {
          missing.push({
            id: "property_details",
            label: "Property details (BIN / borough)",
            fix: "edit_application",
          });
        }
        if (!s(a.ownerFirst) || !s(a.ownerLast) || !s(a.ownerPhone)) {
          missing.push({
            id: "owner_contact",
            label: "Owner / customer contact",
            fix: "edit_application",
          });
        }
      } catch {
        /* ignore */
      }
    }
  } else if (k === "new_meter" || k === "new_application" || k === "meter") {
    if (!caseNumber && !hasFormA) {
      missing.push({
        id: "form_a_or_case",
        label: "Con Ed case number or completed Form A application",
        fix: "create_application",
      });
    }
  } else if (k === "load_letter") {
    if (!caseNumber && !addr) {
      missing.push({
        id: "case_or_address",
        label: "Case number or service address",
        fix: "job",
      });
    }
  } else if (k === "electrical_permit" || k === "file_electrical_permit") {
    if (!addr) {
      /* already pushed */
    }
  }

  // Hard gate shared by enqueue: address + kind-specific
  const ready = missing.length === 0;
  return { ready, missing, caseNumber, hasFormA };
}

/**
 * Levi 2026-08-03: only put something in Deploy queue when we actually have
 * enough info to deploy — not merely because "Electric / New Meter" was tapped.
 *
 * Ready when getDeployReadiness says so (address + case/Form A / request type).
 */
export function isReadyToEnqueueDeploy(job = {}, { kind = "new_meter" } = {}) {
  const k = s(kind).toLowerCase() || "new_meter";
  // New Case can enqueue once address + request type exist (Deploy still
  // validates full questionnaire via createCaseReady). Don't block on soft
  // owner/BIN until Deploy.
  if (k === "new_case" || k === "create_case") {
    const addr = s(job?.serviceAddress || job?.address);
    if (!addr) return false;
    const draft = getCreateCaseState(job);
    const st = s(draft?.status).toLowerCase();
    if (st === "ready_to_fill" || st === "queued" || st === "in_progress") return true;
    const rt = s(draft?.answers?.requestType || draft?.payload?.requestType);
    return !!rt;
  }
  const { ready } = getDeployReadiness(job, { kind: k });
  return ready;
}

/**
 * Failed / rejected fleet runs leave the Deploy queue when the job already
 * has a live case (or a newer success). Stops triple-Failed noise after
 * MC-… success (Levi 2026-08-04 screenshot: 607 ×3 Failed with MC-941793).
 */
export function fleetRunIsSupersededSuccess(run = {}, job = null, allRuns = []) {
  const status = s(run.status).toLowerCase();
  if (status !== "failed" && status !== "rejected") return false;

  const err = s(run.error || run.payload?.error || "").toLowerCase();
  if (err.includes("superseded") || err.includes("newer run") || err.includes("already has")) {
    return true;
  }

  const jobCase =
    jobConedCaseNumber(job) ||
    s(job?.paperwork?.coned?.createCase?.execution?.caseNumber);
  const runCase = s(run.caseNumber || run.payload?.caseNumber || run.result?.caseNumber);
  if (jobCase) {
    // Job already holds a case — failed retries are historical noise
    if (!runCase || runCase.toUpperCase() === jobCase.toUpperCase()) return true;
    // Failed run but job has *any* MC- case for create_case
    if (s(run.type).toLowerCase() === "create_case" && /^MC-/i.test(jobCase)) return true;
  }

  // Another run for same job already done/submitted
  const jobId = s(run.jobId);
  if (jobId && Array.isArray(allRuns)) {
    const siblingOk = allRuns.some((r) => {
      if (!r || r.id === run.id || s(r.jobId) !== jobId) return false;
      const st = s(r.status).toLowerCase();
      return st === "done" || st === "submitted";
    });
    if (siblingOk) return true;
  }

  return false;
}

/** Short UI labels (Levi) — portal still uses the long Energy Services strings. */
export const REQUEST_TYPE_SHORT_LABELS = Object.freeze({
  [REQUEST_TYPES.ADD_LOAD]: "Additional Load",
  [REQUEST_TYPES.NO_ADD_LOAD]: "No Additional Load",
});

export function requestTypeShortLabel(requestType) {
  const rt = normalizeRequestType(requestType);
  return REQUEST_TYPE_SHORT_LABELS[rt] || REQUEST_TYPE_LABELS[rt] || s(requestType).replace(/_/g, " ");
}

/** Deploy action kind ids (queue items / progress — no top-level chooser). */
export const DEPLOY_KINDS = Object.freeze({
  NEW_CASE: "new_case",
  LOAD_LETTER: "load_letter",
  NEW_METER: "new_meter",
  ELECTRICAL_PERMIT: "electrical_permit",
});

/**
 * Labels for deploy kinds (kept for titles / progress; chooser UI removed).
 * @type {ReadonlyArray<{ id: string, title: string, subtitle: string, agency: string, ready: boolean }>}
 */
export const DEPLOY_KIND_OPTIONS = Object.freeze([
  {
    id: DEPLOY_KINDS.NEW_CASE,
    title: "New Case",
    subtitle: "Con Edison case — Additional Load or No Additional Load",
    agency: "Con Edison",
    ready: true,
  },
  {
    id: DEPLOY_KINDS.LOAD_LETTER,
    title: "Load Letter",
    subtitle: "Customer load letter for the service address",
    agency: "Con Edison",
    ready: true,
  },
  {
    id: DEPLOY_KINDS.NEW_METER,
    title: "New Meter",
    subtitle: "Meter application — attaches to an active case when one exists",
    agency: "Con Edison",
    ready: true,
  },
  {
    id: DEPLOY_KINDS.ELECTRICAL_PERMIT,
    title: "Electrical Permit",
    subtitle: "DOB permit next step (queues when Application is ready)",
    agency: "DOB",
    ready: true,
  },
]);

/**
 * Fleet statuses that mean "done" — drop from Deploy queue automatically.
 * Note: "failed" is intentionally NOT completed — but fleetRunIsSupersededSuccess
 * still hides failed rows once the job has a live case.
 */
export const DEPLOY_QUEUE_COMPLETED_STATUSES = new Set(["done", "submitted"]);

/** Whether a queue row should show green Deploy (vs Review / Deploying…). */
export function queueItemCanDeploy(item = {}) {
  const status = s(item.status).toLowerCase();
  if (DEPLOY_QUEUE_COMPLETED_STATUSES.has(status)) return false;
  if (status === "awaiting_approval" || status === "need_info" || status === "failed") {
    return false;
  }
  // Hard blockers (address / Form A) — soft draft missing fields still allow Deploy
  // so createCaseReady can surface the full questionnaire list.
  const hardMissing = (item.missing || item.readiness?.missing || []).filter((m) =>
    ["service_address", "form_a_or_case", "case_or_address"].includes(m.id)
  );
  if (hardMissing.length) return false;
  if (item.source === "fleet") {
    // Already handed to fleet — show Deploying…, not a second Deploy
    if (status === "queued" || status === "in_progress" || status === "approved") {
      return false;
    }
    return false;
  }
  if (item.source === "draft" || item.source === "todo" || item.source === "meter") {
    if (status === "queued" || status === "deploying") return false;
    return true;
  }
  return false;
}

/** True while Deploy is in flight or fleet is actively working. */
export function queueItemIsDeploying(item = {}, deployingIds = {}) {
  if (deployingIds && item.id && deployingIds[item.id]) return true;
  const status = s(item.status).toLowerCase();
  if (item.source === "fleet") {
    return status === "queued" || status === "in_progress" || status === "approved";
  }
  return status === "queued" || status === "deploying";
}

/**
 * Human title for a deploy/queue row.
 * Example: "New Case · Con Edison · 1337 President Street"
 */
export function formatDeployTitle({
  kind = "New Case",
  agency = "Con Edison",
  serviceAddress = "",
} = {}) {
  const parts = [s(kind) || "New Case", s(agency) || "Con Edison"];
  const addr = s(serviceAddress);
  if (addr) parts.push(addr);
  return parts.join(" · ");
}

/** Kind label from a paperwork-jobs type or deploy kind id. */
export function deployKindLabel(typeOrKind) {
  const t = s(typeOrKind).toLowerCase();
  if (t === "create_case" || t === DEPLOY_KINDS.NEW_CASE) return "New Case";
  if (t === "load_letter" || t === DEPLOY_KINDS.LOAD_LETTER) return "Load Letter";
  if (t === "new_meter" || t === "meter_application" || t === DEPLOY_KINDS.NEW_METER) {
    return "New Meter";
  }
  if (
    t === "electrical_permit" ||
    t === "file_electrical_permit" ||
    t === DEPLOY_KINDS.ELECTRICAL_PERMIT
  ) {
    return "Electrical Permit";
  }
  if (t === "upload_document" || t === "upload_application") return "Upload Application";
  return s(typeOrKind).replace(/_/g, " ") || "Application";
}

export function agencyLabelForKind(typeOrKind) {
  const t = s(typeOrKind).toLowerCase();
  if (t.includes("dob") || t.includes("electrical_permit") || t === "file_electrical_permit") {
    return "DOB";
  }
  return "Con Edison";
}

/**
 * Title + subtitle for a fleet case-run (paperwork job).
 * @returns {{ title: string, subtitle: string, requestShort: string, serviceAddress: string }}
 */
export function caseRunDisplay(run = {}, job = null) {
  const payload = run.payload || {};
  const answers = payload.answers || {};
  const serviceAddress =
    s(payload.displayServiceAddress) ||
    s(payload.property?.serviceAddress) ||
    s(answers.serviceAddress) ||
    s(job?.serviceAddress) ||
    s(job?.address) ||
    "";
  const kind = deployKindLabel(run.type || payload.deployKind || "create_case");
  const agency = agencyLabelForKind(run.type || payload.deployKind);
  const title =
    s(payload.displayTitle) ||
    formatDeployTitle({ kind, agency, serviceAddress });
  const requestShort =
    s(payload.requestTypeShort) ||
    requestTypeShortLabel(payload.requestType || answers.requestType);
  const customer = s(job?.customer || job?.customerName || payload.jobName);
  const caseNum = s(run.caseNumber || payload.caseNumber);
  const bits = [requestShort, customer, caseNum ? `Case ${caseNum}` : ""].filter(Boolean);
  return {
    title,
    subtitle: bits.join(" · "),
    requestShort,
    serviceAddress,
    kind,
    agency,
  };
}

/**
 * Display for a job-local createCase draft that is not yet a fleet run.
 */
export function createCaseDraftDisplay(job = {}) {
  const draft = getCreateCaseState(job);
  if (!draft) return null;
  const answers = draft.answers || {};
  const serviceAddress =
    s(answers.serviceAddress) || s(job.serviceAddress) || s(job.address);
  const requestShort = requestTypeShortLabel(answers.requestType || draft.payload?.requestType);
  const status = s(draft.status || "draft");
  // Hide if already driven by a live paperwork job id still active
  return {
    id: `draft:${job.id}`,
    source: "draft",
    jobId: job.id,
    kind: "New Case",
    agency: "Con Edison",
    title: formatDeployTitle({
      kind: "New Case",
      agency: "Con Edison",
      serviceAddress,
    }),
    subtitle: [requestShort, s(job.customer || job.customerName), status]
      .filter(Boolean)
      .join(" · "),
    requestShort,
    serviceAddress,
    status,
    draft,
    removable: true,
    expandable: true,
  };
}

/**
 * When a new meter application is selected, queue it for Deploy and attach
 * any existing Con Ed case number / active case on the job.
 */
export function meterDeployQueuePatch(job = {}, meterValue = "") {
  const v = s(meterValue);
  if (v !== "new_meter" && v !== "new_application") {
    return { patch: null, added: false };
  }
  const caseNumber =
    s(job?.paperwork?.coned?.caseNumber) ||
    s(job?.paperwork?.coned?.createCase?.execution?.caseNumber) ||
    "";
  const kind = "new_meter";
  const { patch, added, todo } = addPaperworkTodoPatch(job, {
    kind: "new_meter",
    meterLabel: v === "new_meter" ? "New Meter" : "New Application",
    title: formatDeployTitle({
      kind: "New Meter",
      agency: "Con Edison",
      serviceAddress: s(job.serviceAddress || job.address),
    }),
    note: caseNumber
      ? `Attach to active case ${caseNumber}`
      : "No case number yet — will attach when a case is active",
    source: "meter_application",
  });
  // Override kind-ish metadata on the todo via note fields; store deploy meta on coned
  const conedMeta = {
    meterDeploy: {
      value: v,
      status: "deploy_queued",
      caseNumber: caseNumber || "",
      attached: !!caseNumber,
      queuedAt: new Date().toISOString(),
    },
  };
  if (caseNumber) {
    conedMeta.caseNumber = caseNumber;
  }
  return {
    added,
    todo,
    patch: {
      paperwork: {
        ...(patch?.paperwork || {}),
        todos: patch?.paperwork?.todos,
        coned: {
          ...(patch?.paperwork?.coned || {}),
          ...conedMeta,
          enabled: true,
        },
      },
    },
  };
}

/**
 * After a process completes: mark Paperwork progress + seed next-step Electrical
 * Permit to-do when the completed kind is a Con Ed application/case.
 */
export function processCompletedProgressPatch(job = {}, { kind = "create_case", permitStage = "application_filed" } = {}) {
  const statusPatch = jobStatusPatchFromPermitStage(permitStage, {
    existingStatus: job.status || {},
  });
  let nextTodo = null;
  const k = s(kind).toLowerCase();
  if (k === "create_case" || k === "new_case" || k === "application" || k === "new_meter") {
    nextTodo = addPaperworkTodoPatch(job, {
      kind: "file_electrical_permit",
      title: formatDeployTitle({
        kind: "Electrical Permit",
        agency: "DOB",
        serviceAddress: s(job.serviceAddress || job.address),
      }),
      note: "Next step after Con Ed application — DOB login + permit details when Submitted",
      source: "process_complete",
    });
  }
  const out = { ...(statusPatch || {}) };
  if (nextTodo?.patch?.paperwork?.todos) {
    out.paperwork = {
      ...(out.paperwork || {}),
      todos: nextTodo.patch.paperwork.todos,
    };
  }
  // Refresh application holding state
  out.paperwork = {
    ...(out.paperwork || {}),
    coned: {
      enabled: true,
      lastProcess: {
        kind,
        completedAt: new Date().toISOString(),
        nextStep: nextTodo?.added ? "electrical_permit" : "",
      },
    },
  };
  return { patch: out, nextStep: nextTodo?.todo || null, addedNext: !!nextTodo?.added };
}

/**
 * Build display rows for the Deploy queue (fleet runs + local drafts + todos).
 * Does not de-dupe fleet runs that already mirror a draft with paperworkJobId.
 */
export function buildDeployQueueItems({ jobs = [], caseRuns = [] } = {}) {
  const jobsById = new Map();
  for (const j of jobs || []) {
    if (j?.id) jobsById.set(j.id, j);
  }

  const fleetIds = new Set(
    (caseRuns || []).map((r) => r?.id).filter(Boolean)
  );
  const linkedPwIds = new Set();
  for (const j of jobs || []) {
    const pwId = j?.paperwork?.coned?.createCase?.execution?.paperworkJobId;
    if (pwId) linkedPwIds.add(pwId);
  }

  const items = [];

  for (const run of caseRuns || []) {
    if (!run || run.dismissed) continue;
    // Completed runs leave the Deploy queue automatically (Levi 2026-08-03)
    if (DEPLOY_QUEUE_COMPLETED_STATUSES.has(s(run.status).toLowerCase())) continue;
    const job = jobsById.get(run.jobId) || null;
    // Failed-when-case-exists (607 ×3 Failed MC-941793) — hide noise
    if (fleetRunIsSupersededSuccess(run, job, caseRuns)) continue;
    const disp = caseRunDisplay(run, job);
    const readiness = getDeployReadiness(job || {}, {
      kind: s(run.type) === "create_case" ? "new_case" : s(run.type) || "new_case",
    });
    items.push({
      id: run.id,
      source: "fleet",
      jobId: run.jobId,
      run,
      job,
      title: disp.title,
      subtitle: disp.subtitle,
      requestShort: disp.requestShort,
      serviceAddress: disp.serviceAddress,
      kind: disp.kind,
      agency: disp.agency,
      status: run.status,
      readiness,
      missing: readiness.missing,
      removable: true,
      expandable: true,
    });
  }

  for (const job of jobs || []) {
    const draft = getCreateCaseState(job);
    if (!draft) continue;
    const pwId = draft.execution?.paperworkJobId;
    // Skip drafts already represented by a live fleet run
    if (pwId && (fleetIds.has(pwId) || linkedPwIds.has(pwId))) {
      // Still show if fleet list is empty of that id (dismissed) — skip only if in list
      if ((caseRuns || []).some((r) => r.id === pwId && !r.dismissed)) continue;
    }
    const st = s(draft.status);
    if (!st || st === "submitted" || st === "done" || st === "removed") continue;
    // Only show when we can actually deploy (not empty electric pick)
    if (st === "draft" && !isReadyToEnqueueDeploy(job, { kind: "new_case" })) continue;
    // Show ready_to_fill / queued / error / draft-with-request-type
    const row = createCaseDraftDisplay(job);
    if (row) {
      const readiness = getDeployReadiness(job, { kind: "new_case" });
      items.push({ ...row, readiness, missing: readiness.missing });
    }
  }

  for (const job of jobs || []) {
    for (const todo of listPaperworkTodos(job)) {
      if (!todo || todo.status === "done" || todo.status === "removed") continue;
      // New-meter todos only when hard-ready to deploy (no silent Ready without Form A/case)
      if (
        (todo.kind === "new_meter" || todo.source === "meter_application") &&
        !isReadyToEnqueueDeploy(job, { kind: "new_meter" })
      ) {
        continue;
      }
      const todoKind =
        todo.kind === "new_meter" || todo.source === "meter_application"
          ? "new_meter"
          : todo.kind === "file_electrical_permit"
            ? "electrical_permit"
            : s(todo.kind) || "new_meter";
      const readiness = getDeployReadiness(job, { kind: todoKind });
      const title =
        s(todo.title) ||
        formatDeployTitle({
          kind: deployKindLabel(todo.kind),
          agency: todo.agency === "dob" ? "DOB" : "Con Edison",
          serviceAddress: s(job.serviceAddress || job.address),
        });
      items.push({
        id: `todo:${job.id}:${todo.id}`,
        source: "todo",
        jobId: job.id,
        job,
        todo,
        title,
        subtitle: [
          s(todo.meterLabel),
          s(job.customer || job.customerName),
          s(todo.status),
        ]
          .filter(Boolean)
          .join(" · "),
        requestShort: "",
        serviceAddress: s(job.serviceAddress || job.address),
        kind: deployKindLabel(todo.kind),
        agency: todo.agency === "dob" ? "DOB" : "Con Edison",
        status: todo.status || "pending",
        readiness,
        missing: readiness.missing,
        removable: true,
        expandable: true,
      });
    }

    // Meter deploy holding state without a todo — only if ready
    const meter = getMeterApplication(job);
    const meterDeploy = job?.paperwork?.coned?.meterDeploy;
    if (
      meter &&
      (meter.value === "new_meter" || meter.value === "new_application") &&
      meterDeploy?.status === "deploy_queued" &&
      isReadyToEnqueueDeploy(job, { kind: "new_meter" })
    ) {
      const already = items.some(
        (it) =>
          it.jobId === job.id &&
          (it.kind === "New Meter" || String(it.todo?.source) === "meter_application")
      );
      if (!already) {
        const caseNumber = s(meterDeploy.caseNumber || job?.paperwork?.coned?.caseNumber);
        const readiness = getDeployReadiness(job, { kind: "new_meter" });
        items.push({
          id: `meter:${job.id}`,
          source: "meter",
          jobId: job.id,
          job,
          title: formatDeployTitle({
            kind: "New Meter",
            agency: "Con Edison",
            serviceAddress: s(job.serviceAddress || job.address),
          }),
          subtitle: [
            meter.label || "New meter",
            s(job.customer || job.customerName),
            caseNumber ? `Case ${caseNumber}` : "No case yet",
          ]
            .filter(Boolean)
            .join(" · "),
          requestShort: "",
          serviceAddress: s(job.serviceAddress || job.address),
          kind: "New Meter",
          agency: "Con Edison",
          status: "deploy_queued",
          readiness,
          missing: readiness.missing,
          removable: true,
          expandable: true,
        });
      }
    }
  }

  // Sort: active fleet first, then pending, by updated/created desc when available
  const rank = (it) => {
    if (it.source === "fleet") {
      if (it.status === "awaiting_approval") return 0;
      if (it.status === "in_progress" || it.status === "queued") return 1;
      return 3;
    }
    if (it.status === "queued" || it.status === "deploy_queued" || it.status === "pending") return 2;
    return 4;
  };
  items.sort((a, b) => rank(a) - rank(b));
  return items;
}

/**
 * Enrich create-case payload with display fields for the Permits queue.
 */
export function withDeployDisplayFields(payload = {}, job = {}) {
  const serviceAddress =
    s(payload.property?.serviceAddress) ||
    s(payload.answers?.serviceAddress) ||
    s(job.serviceAddress) ||
    s(job.address);
  const requestType = payload.requestType || payload.answers?.requestType;
  const requestTypeShort = requestTypeShortLabel(requestType);
  return {
    ...payload,
    deployKind: DEPLOY_KINDS.NEW_CASE,
    displayTitle: formatDeployTitle({
      kind: "New Case",
      agency: "Con Edison",
      serviceAddress,
    }),
    displayServiceAddress: serviceAddress,
    requestTypeShort,
    // Keep full portal label for automation
    requestTypePortal:
      payload.requestTypePortal || REQUEST_TYPE_LABELS[normalizeRequestType(requestType)],
  };
}

export { paperworkTodoLabel };
