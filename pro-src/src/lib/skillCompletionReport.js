/**
 * Skill completion paper trail (Levi 2026-08-10).
 *
 * When a backend ops skill finishes (DOB electrical permit create/update/pay,
 * Full Detailed → Energy Services, etc.):
 *   1. Mark the matching Permits-tab step(s) done on the job
 *   2. Build a plain-language status email (what finished + what's still open)
 *   3. Levi's reply to that email is a trigger to finish incomplete items
 *
 * Pure helpers — host script / command bus send mail + write state.ov.
 */

import {
  caseStepCompletePatch,
  recommendCaseNextSteps,
} from "./caseNextSteps.js";

const s = (v) => (v == null ? "" : String(v).trim());

/** Subject/body tag so replies are easy to match. */
export const SKILL_REPORT_TAG = "LE Skill Report";
/** Machine token in body — reply classifier looks for this. */
export const SKILL_REPORT_REPLY_TOKEN = "LE-SKILL-REPLY";

/** Known skill ids → Permits-tab step ids they complete. */
export const SKILL_STEP_MAP = {
  "dob-file-electrical-permit": ["electrical_permit", "file_electrical_permit"],
  dob_file_electrical_permit: ["electrical_permit", "file_electrical_permit"],
  file_electrical_permit: ["electrical_permit", "file_electrical_permit"],
  electrical_permit: ["electrical_permit", "file_electrical_permit"],
  "coned-submit-electrical-permit": ["coned_submit_electrical_permit"],
  coned_submit_electrical_permit: ["coned_submit_electrical_permit"],
  "coned-upload-document": ["upload_application"],
  coned_upload_document: ["upload_application"],
};

/**
 * Human action label for the email headline.
 * @param {string} action created | updated | paid | issued | uploaded | completed
 */
export function skillActionLabel(action = "") {
  const a = s(action).toLowerCase();
  if (a === "created" || a === "create" || a === "filed" || a === "new") {
    return "Created";
  }
  if (a === "updated" || a === "update" || a === "amended" || a === "edit") {
    return "Updated";
  }
  if (a === "paid" || a === "pay" || a === "citypay") return "Paid + issued";
  if (a === "issued" || a === "issue" || a === "permit_issued") return "Issued";
  if (a === "uploaded" || a === "upload" || a === "on_case") return "Uploaded";
  if (a === "completed" || a === "complete" || a === "done") return "Completed";
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : "Completed";
}

function shortAddress(job = {}) {
  const raw = s(job.serviceAddress || job.address);
  if (!raw) return "";
  return raw.split(",")[0].trim() || raw;
}

function ensureTodoDone(todos, kind, now, extra = {}) {
  const list = Array.isArray(todos) ? todos.map((t) => (t ? { ...t } : t)) : [];
  const idx = list.findIndex((t) => t && t.kind === kind);
  if (idx >= 0) {
    if (list[idx].status !== "done") {
      list[idx] = {
        ...list[idx],
        status: "done",
        doneAt: now,
        doneSource: extra.doneSource || "skill_completion",
        ...extra,
      };
    }
    return list;
  }
  list.push({
    id: `${kind}:skill`,
    kind,
    status: "done",
    title: extra.title || kind.replace(/_/g, " "),
    createdAt: now,
    doneAt: now,
    doneSource: extra.doneSource || "skill_completion",
    ...extra,
  });
  return list;
}

/**
 * Job patch that marks Permits-tab steps complete after a skill finishes.
 * Shallow-safe: returns a paperwork patch the caller deep-merges into the job.
 *
 * @param {{
 *   skill?: string,
 *   job?: object,
 *   result?: {
 *     action?: string,
 *     permitNumber?: string,
 *     jobNumber?: string,
 *     filing?: string,
 *     feePaid?: number|string,
 *     cityPay?: string,
 *     conedCase?: string,
 *     fullDetailedSaved?: boolean,
 *     conedUploaded?: boolean,
 *     notes?: string,
 *     incomplete?: string[],
 *   },
 *   now?: string,
 * }} opts
 * @returns {{ paperwork: object, skillReports?: object[] } | null}
 */
export function skillCompletionJobPatch({
  skill = "",
  job = {},
  result = {},
  now = new Date().toISOString(),
} = {}) {
  const skillId = s(skill) || s(result.skill);
  if (!skillId && !s(result.permitNumber) && !s(result.jobNumber)) return null;

  const r = result || {};
  const permitNumber = s(r.permitNumber || r.jobNumber);
  const jobNumber = s(r.jobNumber || r.permitNumber).replace(/-I\d.*$/i, "") || permitNumber;
  const action = s(r.action) || "completed";
  const conedUploaded =
    r.conedUploaded === true ||
    skillId.includes("coned-submit") ||
    skillId.includes("coned_submit");

  const dobSkill =
    /dob|electrical.?permit|file_electrical/i.test(skillId) ||
    !!(permitNumber && /^(B|M)\d/i.test(permitNumber));

  let paperwork = { ...(job?.paperwork || {}) };
  let todos = Array.isArray(paperwork.todos) ? [...paperwork.todos] : [];
  let changed = false;

  if (dobSkill) {
    const stepPatch = caseStepCompletePatch("electrical_permit", {
      permitNumber,
      jobNumber,
      action,
      completedAt: now,
    });
    const dobFromStep = stepPatch?.paperwork?.dob || {};
    paperwork = {
      ...paperwork,
      dob: {
        ...(paperwork.dob || {}),
        ...dobFromStep,
        enabled: true,
        permitNumber: permitNumber || paperwork.dob?.permitNumber || "",
        jobNumber: jobNumber || paperwork.dob?.jobNumber || "",
        currentStage:
          s(r.currentStage) ||
          dobFromStep.currentStage ||
          paperwork.dob?.currentStage ||
          "permit_issued",
        stageLabel: s(r.stageLabel) || "Permit Issued",
        electricalPermit: {
          ...(paperwork.dob?.electricalPermit || {}),
          ...(dobFromStep.electricalPermit || {}),
          status: "done",
          action,
          permitNumber,
          jobNumber,
          completedAt: now,
          feePaid: r.feePaid != null ? r.feePaid : paperwork.dob?.electricalPermit?.feePaid,
          cityPay: s(r.cityPay) || paperwork.dob?.electricalPermit?.cityPay || "",
          notes: s(r.notes) || "",
        },
        lastSkill: {
          skill: skillId || "dob-file-electrical-permit",
          action,
          at: now,
          permitNumber,
        },
      },
    };
    todos = ensureTodoDone(todos, "file_electrical_permit", now, {
      title: "File electrical permit (DOB)",
      permitNumber,
      note: `${skillActionLabel(action)} ${permitNumber}`.trim(),
    });
    changed = true;
  }

  if (conedUploaded || r.conedUploaded === true) {
    const stepPatch = caseStepCompletePatch("coned_submit_electrical_permit", {
      permitNumber,
      submittedAt: now,
    });
    const conedFromStep = stepPatch?.paperwork?.coned || {};
    paperwork = {
      ...paperwork,
      coned: {
        ...(paperwork.coned || {}),
        ...conedFromStep,
        enabled: paperwork.coned?.enabled !== false,
        caseNumber:
          s(r.conedCase) ||
          paperwork.coned?.caseNumber ||
          conedFromStep.caseNumber ||
          "",
        electricalPermitOnCase: true,
        electricalPermit: {
          ...(paperwork.coned?.electricalPermit || {}),
          ...(conedFromStep.electricalPermit || {}),
          uploaded: true,
          submitted: true,
          status: "on_case",
          submittedAt: now,
          permitNumber,
        },
      },
    };
    todos = ensureTodoDone(todos, "coned_submit_electrical_permit", now, {
      title: "Full Detailed on Energy Services",
      permitNumber,
    });
    changed = true;
  }

  if (!changed) return null;

  const reportEntry = {
    at: now,
    skill: skillId || "unknown",
    action,
    permitNumber,
    jobId: s(job?.id),
    address: shortAddress(job),
    openItems: Array.isArray(r.incomplete) ? r.incomplete.map(s).filter(Boolean) : undefined,
  };

  const priorReports = Array.isArray(paperwork.skillReports)
    ? paperwork.skillReports.slice(-19)
    : [];

  return {
    paperwork: {
      ...paperwork,
      todos,
      skillReports: [...priorReports, reportEntry],
    },
  };
}

/**
 * Open Permits-tab items still due/blocked after the skill (for the email).
 * Prefers explicit result.incomplete; else reads recommendCaseNextSteps on patched job.
 */
export function listOpenAfterSkill(job = {}, result = {}) {
  if (Array.isArray(result.incomplete) && result.incomplete.length) {
    return result.incomplete.map((x) => s(x)).filter(Boolean);
  }
  const rec = recommendCaseNextSteps(job);
  const open = [];
  for (const st of rec.steps || []) {
    if (!st || st.status === "done") continue;
    if (st.status === "due" || st.status === "blocked" || st.status === "waiting") {
      const note = s(st.note);
      open.push(note ? `${st.title} — ${note}` : st.title);
    }
  }
  return open;
}

/**
 * Build subject + body for the skill completion email (paper trail to Levi).
 */
export function buildSkillCompletionEmail({
  skill = "",
  job = {},
  result = {},
  openItems = null,
  brand = "LE Electrical",
} = {}) {
  const r = result || {};
  const actionLabel = skillActionLabel(r.action || "completed");
  const addr = shortAddress(job) || "Job";
  const permitNumber = s(r.permitNumber || r.jobNumber);
  const skillId = s(skill) || s(r.skill) || "ops skill";
  const caseNumber = s(r.conedCase || job?.paperwork?.coned?.caseNumber);
  const customer = s(job.customer || job.customerName || job.businessName);

  const subjectParts = [SKILL_REPORT_TAG, actionLabel, addr];
  if (permitNumber) subjectParts.push(permitNumber);
  const subject = subjectParts.filter(Boolean).join(" · ");

  const lines = [];
  lines.push(`${actionLabel} — ${addr}`);
  lines.push("");
  if (customer) lines.push(`Customer: ${customer}`);
  if (caseNumber) lines.push(`Con Ed case: ${caseNumber}`);
  if (permitNumber) lines.push(`Permit / filing: ${permitNumber}`);
  if (r.feePaid != null && r.feePaid !== "") lines.push(`Fee paid: $${r.feePaid}`);
  if (s(r.cityPay)) lines.push(`CityPay: ${s(r.cityPay)}`);
  lines.push(`Skill: ${skillId}`);
  lines.push("");
  lines.push("What was done:");
  const doneBullets = Array.isArray(r.doneItems) && r.doneItems.length
    ? r.doneItems.map(s).filter(Boolean)
    : defaultDoneItems({ skill: skillId, result: r, actionLabel });
  for (const b of doneBullets) lines.push(`  • ${b}`);

  const open =
    openItems != null
      ? openItems.map(s).filter(Boolean)
      : listOpenAfterSkill(job, r);
  lines.push("");
  if (open.length) {
    lines.push("Still open / missing:");
    for (const o of open) lines.push(`  • ${o}`);
    lines.push("");
    lines.push(
      "Reply to this email to finish anything still open — your reply is the trigger."
    );
  } else {
    lines.push("Still open: none on the Permits tab for this step.");
  }

  lines.push("");
  lines.push(`Marked complete on the Permits tab for ${addr}.`);
  lines.push("");
  lines.push(`— ${brand}`);
  lines.push("");
  // Machine line for reply matching (keep plain so Gmail shows it)
  lines.push(
    `${SKILL_REPORT_REPLY_TOKEN} job=${s(job.id) || "?"} skill=${skillId} permit=${permitNumber || "-"}`
  );

  return {
    subject,
    body: lines.join("\n"),
    toHint: "office", // host sends to office@ / Levi
    openItems: open,
    doneItems: doneBullets,
    replyToken: SKILL_REPORT_REPLY_TOKEN,
    jobId: s(job.id),
    skill: skillId,
    permitNumber,
    kind: "skill_completion_report",
  };
}

function defaultDoneItems({ skill, result, actionLabel }) {
  const r = result || {};
  const out = [];
  const permitNumber = s(r.permitNumber || r.jobNumber);
  if (/dob|electrical.?permit/i.test(skill) || permitNumber) {
    out.push(
      `${actionLabel} electrical permit${permitNumber ? ` ${permitNumber}` : ""}`
    );
    if (r.feePaid != null && r.feePaid !== "") {
      out.push(`Filing fee recorded ($${r.feePaid})`);
    }
    if (r.fullDetailedSaved) out.push("Full Detailed PDF saved");
    if (r.conedUploaded) {
      out.push(
        `Uploaded city electrical permit on Energy Services${
          s(r.conedCase) ? ` (${s(r.conedCase)})` : ""
        }`
      );
    }
  } else if (/coned.?submit|full.?detailed/i.test(skill)) {
    out.push("Full Detailed uploaded / entered on the Con Ed case");
  } else {
    out.push(`${actionLabel} via ${skill || "skill"}`);
  }
  if (s(r.notes)) out.push(s(r.notes));
  return out;
}

/**
 * Detect Levi's reply to a skill report email → open work trigger.
 * @returns {{ isReply: boolean, jobId?: string, skill?: string, permit?: string, instruction?: string } | null}
 */
export function parseSkillReportReply({
  subject = "",
  body = "",
  inReplyTo = "",
  references = "",
} = {}) {
  const blob = `${subject}\n${body}\n${inReplyTo}\n${references}`;
  const isReportThread =
    new RegExp(SKILL_REPORT_TAG.replace(/\s+/g, "\\s+"), "i").test(blob) ||
    blob.includes(SKILL_REPORT_REPLY_TOKEN) ||
    /le-skill-reply/i.test(blob);

  if (!isReportThread) return null;

  const jobM = blob.match(/\bjob=([^\s\]>]+)/i);
  const skillM = blob.match(/\bskill=([^\s\]>]+)/i);
  const permitM = blob.match(/\bpermit=([^\s\]>]+)/i);

  // Strip quoted history for instruction (first non-quoted lines)
  const instruction = s(body)
    .split(/\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith(">")) return false;
      if (/^on .+ wrote:$/i.test(t)) return false;
      if (t.includes(SKILL_REPORT_REPLY_TOKEN)) return false;
      if (new RegExp(SKILL_REPORT_TAG, "i").test(t)) return false;
      return true;
    })
    .join(" ")
    .slice(0, 500);

  return {
    isReply: true,
    jobId: jobM ? s(jobM[1]) : "",
    skill: skillM ? s(skillM[1]) : "",
    permit: permitM && permitM[1] !== "-" ? s(permitM[1]) : "",
    instruction: instruction || "Finish open items from the skill report",
    trigger: "skill_report_reply",
  };
}

/**
 * One-shot: patch + email content after skill success.
 * Caller applies patch to state.ov / jobsdata and sends the email.
 */
export function finalizeSkillCompletion({
  skill = "",
  job = {},
  result = {},
  brand = "LE Electrical",
  now = new Date().toISOString(),
} = {}) {
  const patch = skillCompletionJobPatch({ skill, job, result, now });
  // Simulate post-patch job for open-items scan
  const mergedJob = patch
    ? {
        ...job,
        paperwork: {
          ...(job.paperwork || {}),
          ...(patch.paperwork || {}),
          coned: {
            ...(job.paperwork?.coned || {}),
            ...(patch.paperwork?.coned || {}),
          },
          dob: {
            ...(job.paperwork?.dob || {}),
            ...(patch.paperwork?.dob || {}),
          },
          todos: patch.paperwork?.todos ?? job.paperwork?.todos,
        },
      }
    : job;
  const email = buildSkillCompletionEmail({
    skill,
    job: mergedJob,
    result,
    brand,
  });
  return { patch, email, job: mergedJob };
}
