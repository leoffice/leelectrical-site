/**
 * Con Ed Project Center "Customer To-Do List" → LE Pro case todos.
 *
 * Levi 2026-08-04: when a To-Do email lands, mirror each item onto the job.
 * Each item is checked when complete. Final checklist only after application
 * for service + electric certificate (permit) are done.
 *
 * Example (1127 Lincoln Place / MC-941412):
 *  - Application for Service
 *  - Electric Certificate (needs DOB electrical permit skill — not built yet)
 *  - Final Checklist (gated on the other two)
 */

const s = (v) => (v == null ? "" : String(v).trim());

/** Canonical Con Ed customer to-do kinds we understand. */
export const CONED_CUSTOMER_TODO_KINDS = Object.freeze({
  APPLICATION_FOR_SERVICE: "application_for_service",
  ELECTRIC_CERTIFICATE: "electric_certificate",
  FINAL_CHECKLIST: "final_checklist",
  OTHER: "other",
});

const KIND_ALIASES = [
  {
    kind: CONED_CUSTOMER_TODO_KINDS.APPLICATION_FOR_SERVICE,
    match: /application\s+for\s+service|service\s+application|form\s*a\b|customer\s+application/i,
    title: "Application for Service",
    skill: "coned-application-for-service",
    skillReady: true,
  },
  {
    kind: CONED_CUSTOMER_TODO_KINDS.ELECTRIC_CERTIFICATE,
    match: /electric(?:al)?\s+certificate|elec(?:tric)?\s+cert|certificate\s+of\s+(?:electrical\s+)?compliance/i,
    title: "Electric Certificate",
    skill: "dob-file-electrical-permit",
    skillReady: false, // Levi: build together later
  },
  {
    kind: CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST,
    match: /final\s+(?:inspection\s+)?checklist|checklist\s+submitted|submit\s+(?:the\s+)?final\s+checklist/i,
    title: "Final Checklist",
    skill: "coned-final-checklist",
    skillReady: true,
  },
];

/**
 * Map free-text Con Ed document name → structured to-do.
 */
export function classifyConedTodoName(name = "") {
  const n = s(name);
  if (!n) return null;
  for (const a of KIND_ALIASES) {
    if (a.match.test(n)) {
      return {
        kind: a.kind,
        title: a.title,
        skill: a.skill,
        skillReady: a.skillReady,
        rawName: n,
      };
    }
  }
  return {
    kind: CONED_CUSTOMER_TODO_KINDS.OTHER,
    title: n,
    skill: "",
    skillReady: false,
    rawName: n,
  };
}

/**
 * Parse Con Ed To-Do email body for document rows.
 * Handles:
 *  - "Document Name Status" tables
 *  - "Pending your Submission" blocks
 *  - bullet / line lists of known document names
 *
 * @returns {Array<{ kind, title, skill, skillReady, status, rawName }>}
 */
export function parseConedTodoListFromEmail({ subject = "", body = "" } = {}) {
  const text = `${subject}\n${body}`;
  if (!/to-?do\s*list|pending\s+your\s+submission|document\s+name/i.test(text)) {
    // Still allow known names if subject is a To-Do update
    if (!/to-?do\s*list/i.test(subject)) return [];
  }

  const found = [];
  const seen = new Set();

  // Explicit lines mentioning known documents
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip letterhead noise
    if (/^(date:|service at:|case number:|dear |consolidated edison)/i.test(line)) continue;
    const cls = classifyConedTodoName(line);
    if (!cls || cls.kind === CONED_CUSTOMER_TODO_KINDS.OTHER) {
      // Try embedded name in longer line
      for (const a of KIND_ALIASES) {
        if (a.match.test(line) && !seen.has(a.kind)) {
          const st = /reviewed|received|complete|submitted|approved/i.test(line)
            ? "done"
            : /pending|requested|needed|required/i.test(line)
              ? "pending"
              : "pending";
          found.push({
            kind: a.kind,
            title: a.title,
            skill: a.skill,
            skillReady: a.skillReady,
            status: st,
            rawName: line.slice(0, 120),
          });
          seen.add(a.kind);
        }
      }
      continue;
    }
    if (seen.has(cls.kind)) continue;
    const st = /reviewed|received|complete|submitted|approved/i.test(line)
      ? "done"
      : "pending";
    found.push({ ...cls, status: st });
    seen.add(cls.kind);
  }

  // Subject-only To-Do update with no body rows: leave empty (caller may seed)
  return found;
}

/**
 * Build job patch that merges Con Ed customer todos into paperwork.coned.customerTodos
 * and mirrors actionable ones into paperwork.todos for Deploy / Ready-to-go.
 *
 * Final checklist is gated: status stays blocked until application_for_service
 * + electric_certificate are done (Levi 2026-08-04).
 */
export function jobPatchFromConedCustomerTodos(job = {}, items = [], { caseNumber = "", source = "email" } = {}) {
  const existing = Array.isArray(job?.paperwork?.coned?.customerTodos)
    ? [...job.paperwork.coned.customerTodos]
    : [];
  const byKind = new Map(existing.filter((t) => t?.kind).map((t) => [t.kind, { ...t }]));

  for (const raw of items || []) {
    const cls = raw.kind ? raw : classifyConedTodoName(raw.title || raw.name || raw.rawName);
    if (!cls?.kind) continue;
    const prev = byKind.get(cls.kind) || {};
    const status =
      raw.status === "done" || prev.status === "done"
        ? "done"
        : s(raw.status || prev.status || "pending");
    byKind.set(cls.kind, {
      ...prev,
      id: prev.id || `ctodo:${cls.kind}`,
      kind: cls.kind,
      title: cls.title || prev.title,
      skill: cls.skill || prev.skill || "",
      skillReady: cls.skillReady === true || prev.skillReady === true,
      status,
      rawName: cls.rawName || prev.rawName || "",
      source: source || prev.source || "email",
      updatedAt: new Date().toISOString(),
      caseNumber:
        s(caseNumber) ||
        s(job?.paperwork?.coned?.caseNumber) ||
        s(prev.caseNumber) ||
        "",
    });
  }

  // Gate final checklist
  const app = byKind.get(CONED_CUSTOMER_TODO_KINDS.APPLICATION_FOR_SERVICE);
  const cert = byKind.get(CONED_CUSTOMER_TODO_KINDS.ELECTRIC_CERTIFICATE);
  const final = byKind.get(CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST);
  if (final) {
    const appDone = !app || app.status === "done";
    const certDone = !cert || cert.status === "done";
    if (final.status !== "done") {
      if (!appDone || !certDone) {
        final.status = "blocked";
        final.gate = "application_and_certificate";
        final.note = "Only after Application for Service + Electric Certificate";
      } else if (final.status === "blocked") {
        final.status = "pending";
        final.gate = "";
        final.note = "Prerequisites done — submit final checklist";
      }
    }
    byKind.set(CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST, final);
  }

  const customerTodos = [...byKind.values()];
  const caseNum =
    s(caseNumber) ||
    s(job?.paperwork?.coned?.caseNumber) ||
    customerTodos.find((t) => t.caseNumber)?.caseNumber ||
    "";

  // Mirror to paperwork.todos for skills that are ready
  let todos = Array.isArray(job?.paperwork?.todos) ? [...job.paperwork.todos] : [];
  const ensureTodo = (kind, title, meta = {}) => {
    const idx = todos.findIndex((t) => t && t.kind === kind && t.status !== "removed");
    if (idx >= 0) {
      if (meta.status === "done" && todos[idx].status !== "done") {
        todos[idx] = {
          ...todos[idx],
          status: "done",
          doneAt: new Date().toISOString(),
          doneSource: "coned_customer_todo",
        };
      }
      return;
    }
    if (meta.status === "done") return;
    todos.push({
      id: `ctodo-mirror:${kind}`,
      kind,
      title,
      status: meta.status === "blocked" ? "pending" : meta.status || "pending",
      agency: meta.agency || "coned",
      source: "coned_customer_todo",
      skillReady: meta.skillReady !== false,
      skill: meta.skill || "",
      note: meta.note || "",
      createdAt: new Date().toISOString(),
    });
  };

  for (const t of customerTodos) {
    if (t.kind === CONED_CUSTOMER_TODO_KINDS.APPLICATION_FOR_SERVICE) {
      ensureTodo("upload_application", "Application for Service", {
        status: t.status === "done" ? "done" : "pending",
        skill: t.skill,
        skillReady: true,
        agency: "coned",
      });
    }
    if (t.kind === CONED_CUSTOMER_TODO_KINDS.ELECTRIC_CERTIFICATE) {
      ensureTodo("file_electrical_permit", "Electric Certificate (DOB permit)", {
        status: t.status === "done" ? "done" : "pending",
        skill: t.skill,
        skillReady: false,
        agency: "dob",
        note: "Skill not built yet",
      });
    }
    if (t.kind === CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST && t.status !== "blocked") {
      ensureTodo("final_checklist", "Final Checklist", {
        status: t.status === "done" ? "done" : "pending",
        skill: t.skill,
        skillReady: true,
        agency: "coned",
      });
    }
  }

  return {
    paperwork: {
      coned: {
        enabled: true,
        ...(caseNum ? { caseNumber: caseNum } : {}),
        customerTodos,
        customerTodosSyncedAt: new Date().toISOString(),
        currentStage: job?.paperwork?.coned?.currentStage || "docs_pending",
        stageLabel: job?.paperwork?.coned?.stageLabel || "Docs pending (customer to-do)",
      },
      todos,
    },
  };
}

/**
 * Seed known open todos for a case when email body is image-only but Levi
 * listed the items (e.g. 1127 Lincoln: application, certificate, checklist).
 */
export function seedConedCustomerTodos(names = [], opts = {}) {
  return (names || [])
    .map((n) => {
      const cls = classifyConedTodoName(n);
      if (!cls) return null;
      return { ...cls, status: opts.status || "pending" };
    })
    .filter(Boolean);
}

/**
 * UI helper: action result when user taps a customer to-do / case step.
 * @returns {{ ok: boolean, message: string, action?: string }}
 */
export function conedTodoTapResult(todo = {}, job = {}) {
  const kind = s(todo.kind || todo.id || todo.action);
  const skillReady = todo.skillReady !== false && kind !== "file_electrical_permit" && kind !== "electric_certificate" && kind !== "electrical_permit";

  if (kind === "electric_certificate" || kind === "file_electrical_permit" || kind === "electrical_permit") {
    const hasInfo = !!(
      s(job?.serviceAddress || job?.address) &&
      (s(job?.paperwork?.coned?.caseNumber) || s(todo.caseNumber))
    );
    if (!hasInfo) {
      return { ok: false, message: "Missing information — need service address + Con Ed case" };
    }
    return {
      ok: false,
      message: "Skill not built yet — electrical permit / certificate coming soon",
      action: "skill_not_built",
    };
  }

  if (todo.status === "blocked" || kind === "final_checklist") {
    const list = job?.paperwork?.coned?.customerTodos || [];
    const app = list.find((t) => t.kind === CONED_CUSTOMER_TODO_KINDS.APPLICATION_FOR_SERVICE);
    const cert = list.find((t) => t.kind === CONED_CUSTOMER_TODO_KINDS.ELECTRIC_CERTIFICATE);
    if ((app && app.status !== "done") || (cert && cert.status !== "done")) {
      return {
        ok: false,
        message: "Final checklist locked — finish Application for Service + Electric Certificate first",
        action: "gated",
      };
    }
  }

  if (!skillReady) {
    return { ok: false, message: "Feature coming soon", action: "skill_not_built" };
  }

  if (kind === "application_for_service" || kind === "upload_application") {
    return {
      ok: true,
      message: "Open application for service — send to customer or fill",
      action: "create_application",
    };
  }

  return { ok: true, message: "Ready", action: "open" };
}

export function listConedCustomerTodos(job = {}) {
  const arr = Array.isArray(job?.paperwork?.coned?.customerTodos)
    ? job.paperwork.coned.customerTodos
    : [];
  return arr.filter((t) => t && t.status !== "removed");
}

/**
 * Mark customer-todo items done when Con Ed email says Reviewed/Received/Approved
 * (not still Pending your Submission).
 */
export function markTodosFromEmailStatus(items = [], body = "", subject = "") {
  const text = `${subject}\n${body}`;
  return (items || []).map((it) => {
    if (!it || it.status === "done") return it;
    const name = it.rawName || it.title || "";
    if (!name) return it;
    // If body says this document was Reviewed/Received/Complete
    const re = new RegExp(
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "[\\s\\S]{0,80}(Reviewed|Received|Complete|Submitted|Approved)",
      "i"
    );
    const re2 = new RegExp(
      "(Reviewed|Received|Complete|Submitted|Approved)[\\s\\S]{0,40}" +
        name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    if (re.test(text) || re2.test(text)) {
      return { ...it, status: "done", updatedAt: new Date().toISOString(), doneSource: "email_status" };
    }
    // Global "Pending your Submission" without this name done → keep pending
    return it;
  });
}

/** True if email is a low-noise acknowledgment (no LE Pro notification). */
export function isConedAcknowledgmentOnly(subject = "", body = "") {
  const t = `${subject}\n${body}`;
  if (/acknowledgment\s+letter/i.test(t)) return true;
  if (/we have received your request/i.test(t) && !/pending your submission|to-?do list/i.test(t)) {
    return true;
  }
  return false;
}

/** True if email is an inquiry that needs Levi's attention (notify). */
export function isConedInquiryNeedsAttention(subject = "", body = "") {
  const t = `${subject}\n${body}`;
  if (/inquiry\s+id\s*ci-|con edison inquiry/i.test(t)) return true;
  if (/we have responded to the message/i.test(t) && /inquiry/i.test(t)) return true;
  return false;
}

/**
 * Scan stored email insights for To-Do List updates matching this job's case/address.
 * Returns a job patch or null.
 */
export function updateTodoListFromInsights(job = {}, insights = []) {
  const caseNum = s(job?.paperwork?.coned?.caseNumber);
  const addr = s(job?.serviceAddress || job?.address).toLowerCase();
  const matches = [];
  for (const ins of insights || []) {
    const subj = s(ins?.source?.subject || ins?.subject || "");
    const body = s(ins?.emailSnippet || ins?.summary || ins?.body || "");
    const blob = `${subj}\n${body}\n${s(ins?.address)}`.toLowerCase();
    if (!/to-?do\s*list/i.test(subj) && !/pending your submission/i.test(body)) continue;
    const caseHit = caseNum && blob.includes(caseNum.toLowerCase());
    const addrHit =
      addr &&
      (blob.includes(addr.slice(0, 12)) ||
        s(ins?.address || "")
          .toLowerCase()
          .includes(addr.slice(0, 12)));
    if (!caseHit && !addrHit) continue;
    let items = parseConedTodoListFromEmail({ subject: subj, body });
    if (!items.length && caseHit) {
      // Image-only email — keep existing; only apply status marks
      items = listConedCustomerTodos(job).map((t) => ({ ...t }));
    }
    items = markTodosFromEmailStatus(items, body, subj);
    if (items.length) matches.push({ items, caseNumber: caseNum });
  }
  if (!matches.length) return null;
  // Use the last (most recent) match set
  const last = matches[matches.length - 1];
  return jobPatchFromConedCustomerTodos(job, last.items, {
    caseNumber: last.caseNumber || caseNum,
    source: "email_insight_update",
  });
}
