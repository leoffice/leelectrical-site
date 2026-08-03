/**
 * Paperwork TO-DO model (Levi redirect, 2026-08-02).
 *
 * "Regarding the auto upload, we can't do that yet for now." — completion of
 * an application no longer fires anything at Con Ed. Instead it CREATES A
 * TO-DO on the job's paperwork (Con Edison and/or DOB). Each to-do carries a
 * "Ready to go" action: when Levi taps it (meaning Energy Services / DOB
 * access is unlocked), the matching skill fires through the host command bus
 * (stopping at review — never auto-submitting). Until then the to-do just
 * sits in the list. Vision: LEPRO_PAPERWORK_PERMITS_TAB_VISION.md §6
 * ("paperwork to submit" — an item leaves the list only when complete).
 *
 * To-dos live at job.paperwork.todos (array). The Permits tab aggregates them
 * across all jobs.
 */
import { CONED_UPLOAD_DOCUMENT_CMD, queueConedUploadDocument } from "./uploadToCase.js";
import { resolveConedCaseNumber } from "./autoUploadOnComplete.js";

const now = () => new Date().toISOString();
const s = (v) => (v == null ? "" : String(v).trim());

/**
 * Known to-do kinds. `cmd` is the host command-bus command; execution is the
 * host skill's job (browser login isn't solved yet — the queue IS the clean
 * hook). `needsCase` gates Ready-to-go on a case number being present.
 */
export const PAPERWORK_TODO_KINDS = {
  upload_application: {
    label: "Upload application to the Con Ed case",
    agency: "coned",
    cmd: CONED_UPLOAD_DOCUMENT_CMD,
    skill: "coned-upload-document",
    needsCase: true,
  },
  create_case: {
    label: "Create a new Con Ed case",
    agency: "coned",
    cmd: "coned_create_case",
    skill: "coned-create-case",
    needsCase: false,
  },
  new_meter: {
    label: "New meter application",
    agency: "coned",
    cmd: "coned_meter_application",
    skill: "coned-meter-application",
    needsCase: false, // attaches when a case exists; still queueable without
  },
  send_application: {
    label: "Send application",
    agency: "coned",
    cmd: "coned_send_application",
    skill: "coned-upload-document",
    needsCase: true,
  },
  update_case_status: {
    label: "Update case status",
    agency: "coned",
    cmd: "coned_update_case_status",
    skill: "coned-case-number-intake",
    needsCase: true,
  },
  send_inquiry: {
    label: "Send inquiry",
    agency: "coned",
    cmd: "coned_submit_inquiry",
    skill: "coned-submit-inquiry",
    needsCase: true,
  },
  file_electrical_permit: {
    label: "File electrical permit (DOB)",
    agency: "dob",
    cmd: "dob_file_electrical_permit",
    skill: "dob-file-electrical-permit",
    needsCase: false,
  },
  dob_inspection_request: {
    label: "Request DOB inspection",
    agency: "dob",
    cmd: "dob_inspection_request",
    skill: "dob-inspection-request",
    needsCase: false,
  },
};

export function paperworkTodoLabel(kind) {
  return PAPERWORK_TODO_KINDS[kind]?.label || s(kind).replace(/_/g, " ");
}

/** Live (not done/removed) to-dos on a job. */
export function listPaperworkTodos(job = {}) {
  const arr = Array.isArray(job?.paperwork?.todos) ? job.paperwork.todos : [];
  return arr.filter((t) => t && t.status !== "removed");
}

export function openPaperworkTodos(job = {}) {
  return listPaperworkTodos(job).filter(
    (t) => t.status !== "done" && t.status !== "queued"
  );
}

function todoId(kind, meterLabel) {
  return `${kind}:${s(meterLabel) || "job"}`;
}

/**
 * Build a patch adding a to-do (idempotent per kind+meter: an existing live
 * entry of the same identity is kept, not duplicated).
 * Returns { patch, todo, added }.
 */
export function addPaperworkTodoPatch(job = {}, { kind, meterLabel = "", title = "", note = "", source = "" } = {}) {
  const def = PAPERWORK_TODO_KINDS[kind];
  const id = todoId(kind, meterLabel);
  const existing = Array.isArray(job?.paperwork?.todos) ? job.paperwork.todos : [];
  const live = existing.find(
    (t) => t && t.id === id && t.status !== "removed" && t.status !== "done"
  );
  if (live) {
    return { patch: null, todo: live, added: false };
  }
  const todo = {
    id,
    kind,
    agency: def?.agency || "coned",
    title: s(title) || paperworkTodoLabel(kind),
    note: s(note),
    meterLabel: s(meterLabel),
    source: s(source),
    status: "pending",
    createdAt: now(),
  };
  // Replace any dead entry with the same id; append otherwise.
  const rest = existing.filter((t) => !(t && t.id === id));
  return {
    patch: { paperwork: { todos: [...rest, todo] } },
    todo,
    added: true,
  };
}

/** Patch updating one to-do's status (+extra fields). */
export function updatePaperworkTodoPatch(job = {}, id, status, extra = {}) {
  const existing = Array.isArray(job?.paperwork?.todos) ? job.paperwork.todos : [];
  if (!existing.some((t) => t && t.id === id)) return null;
  return {
    paperwork: {
      todos: existing.map((t) =>
        t && t.id === id ? { ...t, ...extra, status, updatedAt: now() } : t
      ),
    },
  };
}

/**
 * "Ready to go" — Levi says access is unlocked; fire the matching skill.
 * Upload-application uses the real S24 queue (docKey from the tab, stops at
 * review). Every other kind queues its host command with a clean payload —
 * the browser execution is the host skill's concern.
 * Never throws. Returns { ok, queued, error, todoPatch }.
 */
export async function readyToGoTodo({ job = {}, todo = {}, enqueue = null, onSave = null } = {}) {
  const def = PAPERWORK_TODO_KINDS[todo.kind];
  if (!def) {
    return { ok: false, queued: false, error: `unknown to-do kind: ${todo.kind}` };
  }
  const caseNumber = resolveConedCaseNumber(job);
  if (def.needsCase && !caseNumber) {
    return {
      ok: false,
      queued: false,
      error: "needs_case_number: enter the MC-###### case number on this job first",
    };
  }

  let result;
  if (todo.kind === "upload_application" || todo.kind === "send_application") {
    result = await queueConedUploadDocument({
      job,
      meterLabel: todo.meterLabel || "",
      caseNumber,
      enqueue,
      onSave: null,
    });
  } else if (typeof enqueue === "function") {
    try {
      const payload = {
        skill: def.skill,
        version: 1,
        jobId: job.id || "",
        todoId: todo.id,
        meterLabel: todo.meterLabel || "",
        caseNumber,
        stopAt: "review",
        autoSubmit: false,
      };
      const idk = `pw-todo:${job.id || "job"}:${todo.id}`;
      await enqueue(def.cmd, job.id || "job", payload, "deterministic", idk);
      result = { ok: true, queued: true, payload };
    } catch (err) {
      result = { ok: false, queued: false, error: String(err?.message || err) };
    }
  } else {
    result = { ok: false, queued: false, error: "enqueue_not_wired" };
  }

  const todoPatch = updatePaperworkTodoPatch(
    job,
    todo.id,
    result.queued ? "queued" : todo.status || "pending",
    result.queued
      ? { firedAt: now(), caseNumber, error: "" }
      : { error: result.error || "" }
  );
  if (todoPatch && typeof onSave === "function") onSave(todoPatch);
  return { ...result, todoPatch };
}

/**
 * Completion hook (replaces the v258 auto-upload): a finished application —
 * office- or customer-filled — adds the "upload to case" to-do + notification.
 */
export function completionTodoPatch(job = {}, { meterLabel = "", source = "office" } = {}) {
  const { patch, added } = addPaperworkTodoPatch(job, {
    kind: "upload_application",
    meterLabel,
    source,
    note:
      source === "customer"
        ? "Customer-completed Form A is on the Con Edison Application tab."
        : "Completed Form A is on the Con Edison Application tab.",
  });
  const prevNotifications = Array.isArray(job?.paperwork?.coned?.notifications)
    ? job.paperwork.coned.notifications.slice(-19)
    : [];
  const notifications = [
    ...prevNotifications,
    {
      at: now(),
      type: "todo_created",
      meterLabel,
      source,
      text: `Application completed${meterLabel ? ` (${meterLabel})` : ""} - added "Upload application to the Con Ed case" to the paperwork to-do list. Tap Ready to go when Energy Services access is unlocked.`,
    },
  ];
  return {
    added,
    patch: {
      ...(patch || {}),
      paperwork: {
        ...((patch && patch.paperwork) || {}),
        coned: { notifications },
      },
    },
  };
}
