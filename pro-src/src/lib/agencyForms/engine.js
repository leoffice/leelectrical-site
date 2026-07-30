/**
 * Reusable agency form-fill engine.
 * Agency = config (field schema + steps + submit/email target).
 * Con Ed Form A is the first agency; others plug in the same shape.
 */

/** @typedef {{ key: string, label: string, type?: string, required?: boolean, placeholder?: string, options?: string[], inputMode?: string, autoComplete?: string, when?: (answers: Record<string,string|boolean|string[]>) => boolean, hint?: string }} AgencyField */
/** @typedef {{ id: string, title: string, shortTitle?: string, intro?: string, fields: AgencyField[] }} AgencyStep */
/** @typedef {{ id: string, label: string, description?: string, formTitle: string, submitEmailDefault: string[], steps: AgencyStep[], seedFromJob?: (job: object) => Record<string, any> }} AgencyConfig */

/**
 * Fields visible for a step given current answers (progressive disclosure).
 * @param {AgencyStep} step
 * @param {Record<string, any>} answers
 */
export function visibleFields(step, answers = {}) {
  return (step?.fields || []).filter((f) => {
    if (typeof f.when === "function") {
      try {
        return !!f.when(answers);
      } catch {
        return true;
      }
    }
    return true;
  });
}

/**
 * Required fields on a step that are still empty.
 * @param {AgencyStep} step
 * @param {Record<string, any>} answers
 */
export function missingRequired(step, answers = {}) {
  return visibleFields(step, answers).filter((f) => {
    if (!f.required) return false;
    const v = answers[f.key];
    if (f.type === "checkbox") return !v;
    if (f.type === "checkboxes") return !Array.isArray(v) || v.length === 0;
    if (v == null) return true;
    return String(v).trim() === "";
  });
}

/**
 * All steps that still have missing required fields.
 * @param {AgencyConfig} agency
 * @param {Record<string, any>} answers
 */
export function incompleteSteps(agency, answers = {}) {
  return (agency?.steps || []).filter((s) => missingRequired(s, answers).length > 0);
}

/**
 * Whether the whole application can be submitted.
 * @param {AgencyConfig} agency
 * @param {Record<string, any>} answers
 */
export function applicationReady(agency, answers = {}) {
  return incompleteSteps(agency, answers).length === 0;
}

/**
 * Flat list of { part, label, value } for review / PDF / email.
 * @param {AgencyConfig} agency
 * @param {Record<string, any>} answers
 */
export function applicationFieldRows(agency, answers = {}) {
  const rows = [];
  for (const step of agency?.steps || []) {
    for (const f of visibleFields(step, answers)) {
      const raw = answers[f.key];
      let value = "";
      if (f.type === "checkbox") value = raw ? "Yes" : "No";
      else if (f.type === "checkboxes") value = Array.isArray(raw) ? raw.join(", ") : String(raw || "");
      else if (f.type === "select" || f.type === "radio") value = raw == null ? "" : String(raw);
      else value = raw == null ? "" : String(raw);
      if (!String(value).trim() && f.type !== "checkbox") continue;
      rows.push({
        stepId: step.id,
        stepTitle: step.title,
        key: f.key,
        label: f.label,
        value: value === "" && f.type === "checkbox" ? "No" : value,
      });
    }
  }
  return rows;
}

/**
 * Merge answers; empty string clears a key.
 * @param {Record<string, any>} prev
 * @param {string} key
 * @param {any} value
 */
export function setAnswer(prev, key, value) {
  return { ...(prev || {}), [key]: value };
}

/**
 * Toggle a multi-checkbox value.
 * @param {Record<string, any>} prev
 * @param {string} key
 * @param {string} option
 * @param {boolean} on
 */
export function toggleMulti(prev, key, option, on) {
  const cur = Array.isArray(prev?.[key]) ? [...prev[key]] : [];
  const i = cur.indexOf(option);
  if (on && i < 0) cur.push(option);
  if (!on && i >= 0) cur.splice(i, 1);
  return { ...(prev || {}), [key]: cur };
}

/**
 * Build a draft payload for job storage.
 * @param {object} opts
 */
export function buildApplicationDraft({
  agencyId,
  answers = {},
  status = "draft",
  stepIndex = 0,
  submittedAt = "",
  emailResult = null,
} = {}) {
  return {
    agencyId: String(agencyId || ""),
    answers: { ...answers },
    status, // draft | submitted
    stepIndex: Number(stepIndex) || 0,
    updatedAt: Date.now(),
    submittedAt: submittedAt || "",
    emailResult: emailResult || null,
  };
}

/**
 * Destination emails for submit — draft override > agency default.
 * @param {AgencyConfig} agency
 * @param {string|string[]} [override]
 */
export function resolveSubmitEmails(agency, override) {
  if (override != null && String(override).trim()) {
    return String(override)
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const d = agency?.submitEmailDefault || [];
  return (Array.isArray(d) ? d : [d]).map((s) => String(s || "").trim()).filter(Boolean);
}

/**
 * HTML email body with full field list (not a stub).
 * @param {AgencyConfig} agency
 * @param {Record<string, any>} answers
 * @param {object} [job]
 */
export function buildApplicationEmailHtml(agency, answers, job = {}) {
  const rows = applicationFieldRows(agency, answers);
  const site = job.serviceAddress || job.address || "";
  const cust = job.customer || job.customerName || job.displayName || "";
  const parts = [];
  let lastStep = "";
  for (const r of rows) {
    if (r.stepTitle !== lastStep) {
      lastStep = r.stepTitle;
      parts.push(
        `<tr><td colspan="2" style="padding:12px 0 6px;font-weight:700;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0">${esc(
          lastStep
        )}</td></tr>`
      );
    }
    parts.push(
      `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#64748b;font-size:13px;width:40%">${esc(
        r.label
      )}</td><td style="padding:4px 0;vertical-align:top;color:#0f172a;font-size:13px;font-weight:600">${esc(
        r.value
      )}</td></tr>`
    );
  }
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a">
  <h1 style="font-size:18px;margin:0 0 8px">${esc(agency?.formTitle || agency?.label || "Application")}</h1>
  <p style="margin:0 0 4px;color:#64748b;font-size:13px">Job: ${esc(cust)}${site ? " · " + esc(site) : ""}</p>
  <p style="margin:0 0 16px;color:#64748b;font-size:12px">Full completed application — every filled field below. PDF attached.</p>
  <table style="border-collapse:collapse;width:100%;max-width:640px">${parts.join("")}</table>
  </body></html>`;
}

/**
 * Plain-text fallback for the same content.
 */
export function buildApplicationEmailText(agency, answers, job = {}) {
  const rows = applicationFieldRows(agency, answers);
  const lines = [
    agency?.formTitle || agency?.label || "Application",
    `Job: ${job.customer || job.customerName || ""} ${job.serviceAddress || job.address || ""}`.trim(),
    "",
  ];
  let lastStep = "";
  for (const r of rows) {
    if (r.stepTitle !== lastStep) {
      lastStep = r.stepTitle;
      lines.push(`--- ${lastStep} ---`);
    }
    lines.push(`${r.label}: ${r.value}`);
  }
  return lines.join("\n");
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
