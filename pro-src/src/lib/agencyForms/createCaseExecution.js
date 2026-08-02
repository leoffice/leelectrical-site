/**
 * S23 — create-case EXECUTION handoff.
 *
 * Queues host command `coned_create_case` with the branched payload.
 * Host auto-fills Energy Services wizard UP TO REVIEW; human confirms submit.
 * Never stores Con Ed passwords. Session-only on host.
 */
import {
  buildCreateCaseDraft,
  buildCreateCasePayload,
  createCaseReady,
  sanitizeAnswers,
} from "./createCaseQuestionnaire.js";

export const CONED_CREATE_CASE_CMD = "coned_create_case";

import { createPaperworkJob } from "../paperworkJobs.js";

/**
 * The app->backend BRIDGE (Levi 2026-08-02): Submit a Case writes a
 * `create_case` paperwork job (status=queued) that the local fleet agent
 * claims and drives in the browser. The fleet parks at Review with a
 * screenshot (awaiting_approval); Levi approves IN THE APP before any submit.
 * Replaces the host command-bus enqueue as the execution path.
 */
export async function createCasePaperworkJob({ answers = {}, job = {}, onSave = null } = {}) {
  const sanitized = sanitizeAnswers(answers);
  if (!createCaseReady(sanitized)) {
    return {
      ok: false,
      error: "questionnaire_incomplete",
      draft: buildCreateCaseDraft(sanitized, job, { status: "draft" }),
    };
  }
  const payload = buildCreateCasePayload(sanitized, job);
  const r = await createPaperworkJob({
    type: "create_case",
    jobId: job.id || "",
    payload: {
      ...payload,
      jobId: job.id || "",
      answers: sanitized,
      skill: "coned-create-case",
      stopAt: "review",
      autoSubmit: false,
    },
  });
  const execution = {
    status: r.ok ? "queued" : "error",
    queuedAt: new Date().toISOString(),
    stopAt: "review",
    autoSubmit: false,
    branch: payload.branch,
    requestType: payload.requestType,
    paperworkJobId: r.ok ? r.job?.id || "" : "",
    backend: true,
    error: r.ok ? "" : r.error || "backend_create_failed",
  };
  const draft = buildCreateCaseDraft(sanitized, job, {
    status: r.ok ? "ready_to_fill" : "draft",
    execution,
    payload,
  });
  if (typeof onSave === "function") {
    onSave({
      paperwork: {
        coned: {
          enabled: true,
          createCase: draft,
          active: { "Application submitted": true },
        },
      },
    });
  }
  return { ok: r.ok, error: r.ok ? "" : r.error, draft, paperworkJobId: execution.paperworkJobId };
}

/**
 * Queue create-case for host automation.
 * @returns {{ ok: boolean, draft: object, error?: string, queued?: boolean }}
 */
export async function queueConedCreateCase({
  answers = {},
  job = {},
  enqueue = null,
  onSave = null,
} = {}) {
  const sanitized = sanitizeAnswers(answers);
  if (!createCaseReady(sanitized)) {
    return {
      ok: false,
      error: "questionnaire_incomplete",
      draft: buildCreateCaseDraft(sanitized, job, { status: "draft" }),
    };
  }
  const payload = buildCreateCasePayload(sanitized, job);
  const execution = {
    status: "queued",
    queuedAt: new Date().toISOString(),
    stopAt: "review",
    autoSubmit: false,
    branch: payload.branch,
    requestType: payload.requestType,
    error: "",
  };
  const draft = buildCreateCaseDraft(sanitized, job, {
    status: "ready_to_fill",
    execution,
    payload,
  });

  if (typeof onSave === "function") {
    onSave({
      paperwork: {
        coned: {
          enabled: true,
          createCase: draft,
          // keep branch active for stage tracking
          active: { "Application submitted": true },
        },
      },
    });
  }

  if (typeof enqueue !== "function") {
    return {
      ok: false,
      queued: false,
      error:
        "enqueue_not_wired: host command_listener must handle coned_create_case (session-only, stop at Review)",
      draft: {
        ...draft,
        execution: {
          ...execution,
          status: "blocked",
          error: "enqueue_not_wired",
        },
      },
    };
  }

  try {
    const idk = `coned-create-case:${job.id || "job"}:${payload.requestType}:${Date.now()}`;
    await enqueue(
      CONED_CREATE_CASE_CMD,
      job.id || "coned",
      {
        ...payload,
        // host needs job context for status write-back
        jobId: job.id || "",
        answers: sanitized,
      },
      "deterministic",
      idk
    );
    return {
      ok: true,
      queued: true,
      draft: {
        ...draft,
        execution: { ...execution, status: "queued", note: "awaiting_host_fill_to_review" },
      },
    };
  } catch (err) {
    return {
      ok: false,
      queued: false,
      error: String(err?.message || err),
      draft: {
        ...draft,
        execution: {
          ...execution,
          status: "error",
          error: String(err?.message || err),
        },
      },
    };
  }
}

/** Read create-case state from job. */
export function getCreateCaseState(job = {}) {
  return job?.paperwork?.coned?.createCase || null;
}
