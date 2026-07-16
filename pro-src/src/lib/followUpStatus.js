// Status-aware follow-ups — respect recent sends, unsent docs, contextual nudges.
import { lastDocSend, docSendInFlight, docSendSucceeded } from "./docSendStatus.js";
import { classifyAppointment } from "./appointmentActions.js";
import { addDays } from "./calendarDue.js";

function daysBetween(earlier, later) {
  const a = new Date(String(earlier) + "T12:00:00").getTime();
  const b = new Date(String(later) + "T12:00:00").getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export const SENT_FOLLOWUP_DAYS = 7;
export const UNSENT_DISMISS_KEY = "lepro_unsent_dismissed";

function s(v) {
  return v == null ? "" : String(v).trim();
}

export function hasDoc(job, docKind) {
  if (!job) return false;
  if (docKind === "invoice") return !!(job.invoiceNo || job._invoiceConfirmed);
  return !!(job.estimateNo || job._estimateConfirmed || (job.estimateLines && job.estimateLines.length));
}

/** True only when the doc exists locally but no email record confirms delivery. */
export function docNeverSent(job, docKind, commands = []) {
  if (!hasDoc(job, docKind)) return false;
  if (docSendInFlight(commands, job.id, docKind)) return false;
  if (docSendSucceeded(commands, job, docKind)) return false;
  if (lastDocSend(job, docKind)) return false;
  return true;
}

export function daysSinceDocSent(job, docKind, today) {
  const last = lastDocSend(job, docKind);
  const ymd = s(last?.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !today) return null;
  return daysBetween(ymd, today);
}

export function withinSentCooldown(job, docKind, today, days = SENT_FOLLOWUP_DAYS) {
  const elapsed = daysSinceDocSent(job, docKind, today);
  return elapsed != null && elapsed < days;
}

export function sentFollowUpRemindAt(job, docKind, days = SENT_FOLLOWUP_DAYS) {
  const last = lastDocSend(job, docKind);
  const sentYmd = s(last?.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentYmd)) return "";
  return addDays(sentYmd, days) + "T10:00";
}

function firstName(customer) {
  return s(customer).split(/\s+/)[0] || "the customer";
}

/** Specific nudge when paperwork exists — uses send status, not generic reminders. */
export function specificFollowUpNudge(job, today, commands = []) {
  if (!job) return "";
  const name = firstName(job.customer);

  if (hasDoc(job, "invoice")) {
    if (docNeverSent(job, "invoice", commands)) {
      const no = job.invoiceNo ? " #" + job.invoiceNo : "";
      return `Invoice${no} for ${name} is ready but hasn't been emailed yet — tap through to review and send it.`;
    }
    const last = lastDocSend(job, "invoice");
    const sent = s(last?.date).slice(0, 10);
    const days = sent && today ? daysBetween(sent, today) : null;
    const to = last?.to ? " to " + last.to : "";
    if (days != null && days < SENT_FOLLOWUP_DAYS) {
      return `Invoice${job.invoiceNo ? " #" + job.invoiceNo : ""} went out${to} on ${sent} — I'll check back in a week unless you want to nudge sooner.`;
    }
    return `Invoice${job.invoiceNo ? " #" + job.invoiceNo : ""} for ${name} was emailed${to}${sent ? " on " + sent : ""} — worth a friendly payment follow-up email.`;
  }

  if (hasDoc(job, "estimate")) {
    if (docNeverSent(job, "estimate", commands)) {
      const no = job.estimateNo ? " #" + job.estimateNo : "";
      return `Estimate${no} for ${name} was created but never sent — open it and email it when you're ready.`;
    }
    const last = lastDocSend(job, "estimate");
    const sent = s(last?.date).slice(0, 10);
    const days = sent && today ? daysBetween(sent, today) : null;
    const to = last?.to ? " to " + last.to : "";
    if (days != null && days < SENT_FOLLOWUP_DAYS) {
      return `Estimate${job.estimateNo ? " #" + job.estimateNo : ""} went out${to} on ${sent} — I'll ping you in a week for a follow-up.`;
    }
    return `Estimate${job.estimateNo ? " #" + job.estimateNo : ""} for ${name} was emailed${to}${sent ? " on " + sent : ""} — check if they're ready to approve or need changes.`;
  }

  return "";
}

/** Whether a past-week service-call popup should be skipped for this job. */
export function assessJobFollowUp(job, today, commands = []) {
  if (!job) return { suppressServiceCall: false };

  if (hasDoc(job, "invoice")) {
    if (docNeverSent(job, "invoice", commands)) {
      return { suppressServiceCall: true, reason: "invoice_unsent", docKind: "invoice" };
    }
    if (withinSentCooldown(job, "invoice", today)) {
      return {
        suppressServiceCall: true,
        reason: "invoice_sent_cooldown",
        docKind: "invoice",
        autoRemindAt: sentFollowUpRemindAt(job, "invoice"),
        nudge: specificFollowUpNudge(job, today, commands),
      };
    }
    return {
      suppressServiceCall: false,
      reason: "invoice_followup",
      docKind: "invoice",
      nudge: specificFollowUpNudge(job, today, commands),
    };
  }

  if (hasDoc(job, "estimate")) {
    if (docNeverSent(job, "estimate", commands)) {
      return { suppressServiceCall: true, reason: "estimate_unsent", docKind: "estimate" };
    }
    if (withinSentCooldown(job, "estimate", today)) {
      return {
        suppressServiceCall: true,
        reason: "estimate_sent_cooldown",
        docKind: "estimate",
        autoRemindAt: sentFollowUpRemindAt(job, "estimate"),
        nudge: specificFollowUpNudge(job, today, commands),
      };
    }
    return {
      suppressServiceCall: false,
      reason: "estimate_followup",
      docKind: "estimate",
      nudge: specificFollowUpNudge(job, today, commands),
    };
  }

  return { suppressServiceCall: false };
}

export function loadUnsentDismissed() {
  try {
    const raw = localStorage.getItem(UNSENT_DISMISS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function saveUnsentDismissed(state) {
  try {
    localStorage.setItem(UNSENT_DISMISS_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}

export function dismissUnsentDoc(jobId, docKind) {
  const st = loadUnsentDismissed();
  st[jobId + ":" + docKind] = Date.now();
  saveUnsentDismissed(st);
}

export function isUnsentDismissed(jobId, docKind) {
  return !!loadUnsentDismissed()[jobId + ":" + docKind];
}

/** Active jobs with a generated doc that was never emailed. */
export function unsentDocCandidates(jobs, commands = [], { dismissed = loadUnsentDismissed() } = {}) {
  const out = [];
  for (const job of jobs || []) {
    if (!job?.id || job.paid || job._archived || job._deleted) continue;
    for (const kind of ["invoice", "estimate"]) {
      if (!docNeverSent(job, kind, commands)) continue;
      if (dismissed[job.id + ":" + kind]) continue;
      out.push({ job, docKind: kind, docNo: kind === "invoice" ? job.invoiceNo : job.estimateNo });
    }
  }
  return out.sort((a, b) => String(b.job.id).localeCompare(String(a.job.id)));
}

export function unsentDocLead({ job, docKind, docNo }) {
  const name = firstName(job?.customer);
  const label = docKind === "invoice" ? "Invoice" : "Estimate";
  const no = docNo ? " #" + docNo : "";
  return `${label}${no} for ${name} was created but never emailed.`;
}

export function unsentDocPath(job, docKind) {
  if (!job?.id) return "";
  return "/job/" + encodeURIComponent(job.id) + "?doc=" + docKind;
}