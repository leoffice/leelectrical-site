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

const s = (v) => (v == null ? "" : String(v).trim());

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

/** Fleet statuses that mean "done" — drop from Deploy queue automatically. */
export const DEPLOY_QUEUE_COMPLETED_STATUSES = new Set(["done", "submitted"]);

/** Whether a queue row should show green Deploy (vs Review / Deploying…). */
export function queueItemCanDeploy(item = {}) {
  const status = s(item.status).toLowerCase();
  if (DEPLOY_QUEUE_COMPLETED_STATUSES.has(status)) return false;
  if (status === "awaiting_approval") return false;
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
    const disp = caseRunDisplay(run, job);
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
    // Show draft / ready_to_fill / queued / error
    const row = createCaseDraftDisplay(job);
    if (row) items.push(row);
  }

  for (const job of jobs || []) {
    for (const todo of listPaperworkTodos(job)) {
      if (!todo || todo.status === "done" || todo.status === "removed") continue;
      // create_case todos that only mirror a draft — still useful for remove UX
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
        removable: true,
        expandable: true,
      });
    }

    // Meter deploy holding state without a todo
    const meter = getMeterApplication(job);
    const meterDeploy = job?.paperwork?.coned?.meterDeploy;
    if (
      meter &&
      (meter.value === "new_meter" || meter.value === "new_application") &&
      meterDeploy?.status === "deploy_queued"
    ) {
      const already = items.some(
        (it) =>
          it.jobId === job.id &&
          (it.kind === "New Meter" || String(it.todo?.source) === "meter_application")
      );
      if (!already) {
        const caseNumber = s(meterDeploy.caseNumber || job?.paperwork?.coned?.caseNumber);
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
