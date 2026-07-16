// Status-aware follow-ups — respect recent sends, unsent docs, contextual nudges.
import { lastDocSend, docSendInFlight, docSendSucceeded } from "./docSendStatus.js";
import { classifyAppointment } from "./appointmentActions.js";
import { addDays } from "./calendarDue.js";
import { openBalance, invoiceTotal } from "./customers.js";
import { serviceAddressDisplay } from "./customerSync.js";
import { jobInvoiceDateDisplay, jobServiceDateDisplay } from "./customerDocLists.js";
import { fmt$ } from "./format.js";

function daysBetween(earlier, later) {
  const a = new Date(String(earlier) + "T12:00:00").getTime();
  const b = new Date(String(later) + "T12:00:00").getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export const SENT_FOLLOWUP_DAYS = 7;
export const UNSENT_DISMISS_KEY = "lepro_unsent_dismissed";
export const UNSENT_SNOOZE_KEY = "lepro_unsent_snoozed";

function s(v) {
  return v == null ? "" : String(v).trim();
}

function unsentKey(jobId, docKind) {
  return String(jobId || "") + ":" + String(docKind || "");
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
  st[unsentKey(jobId, docKind)] = Date.now();
  saveUnsentDismissed(st);
  // Permanent dismiss wins — clear any temporary snooze.
  clearUnsentSnooze(jobId, docKind);
}

export function isUnsentDismissed(jobId, docKind) {
  return !!loadUnsentDismissed()[unsentKey(jobId, docKind)];
}

export function loadUnsentSnoozed() {
  try {
    const raw = localStorage.getItem(UNSENT_SNOOZE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function saveUnsentSnoozed(state) {
  try {
    localStorage.setItem(UNSENT_SNOOZE_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}

/** Hide an unsent-doc reminder until a weekday/work-hour datetime. */
export function snoozeUnsentDoc(jobId, docKind, untilIso) {
  if (!jobId || !docKind || !untilIso) return;
  const st = loadUnsentSnoozed();
  st[unsentKey(jobId, docKind)] = String(untilIso);
  saveUnsentSnoozed(st);
}

export function clearUnsentSnooze(jobId, docKind) {
  const st = loadUnsentSnoozed();
  const k = unsentKey(jobId, docKind);
  if (!(k in st)) return;
  delete st[k];
  saveUnsentSnoozed(st);
}

export function isUnsentSnoozed(jobId, docKind, now = new Date()) {
  const until = loadUnsentSnoozed()[unsentKey(jobId, docKind)];
  if (!until) return false;
  const t = new Date(until).getTime();
  if (!Number.isFinite(t)) return false;
  if (t <= now.getTime()) {
    clearUnsentSnooze(jobId, docKind);
    return false;
  }
  return true;
}

/** Active jobs with a generated doc that was never emailed. */
export function unsentDocCandidates(
  jobs,
  commands = [],
  { dismissed = loadUnsentDismissed(), now = new Date() } = {}
) {
  const out = [];
  for (const job of jobs || []) {
    if (!job?.id || job.paid || job._archived || job._deleted) continue;
    for (const kind of ["invoice", "estimate"]) {
      if (!docNeverSent(job, kind, commands)) continue;
      if (dismissed[unsentKey(job.id, kind)]) continue;
      if (isUnsentSnoozed(job.id, kind, now)) continue;
      out.push({ job, docKind: kind, docNo: kind === "invoice" ? job.invoiceNo : job.estimateNo });
    }
  }
  return out.sort((a, b) => String(b.job.id).localeCompare(String(a.job.id)));
}

export function unsentDocLead({ job, docKind, docNo }) {
  const name = firstName(job?.customer);
  const label = docKind === "invoice" ? "Invoice" : "Estimate";
  const no = docNo ? " #" + docNo : "";
  return `${label}${no} for ${name} was created but never emailed — verify it was not sent, then open and send.`;
}

/**
 * Card fields for unsent invoice/estimate reminders:
 * number, date, service address, amount invoiced, amount due (when different).
 */
export function unsentDocCardFields(job, docKind) {
  const j = job || {};
  const isInv = docKind !== "estimate";
  const docNo = isInv ? j.invoiceNo : j.estimateNo;
  const date = isInv
    ? jobInvoiceDateDisplay(j) || jobServiceDateDisplay(j)
    : jobServiceDateDisplay(j) || jobInvoiceDateDisplay(j);
  const address = serviceAddressDisplay(j) || j.serviceAddress || j.address || "";
  const total = invoiceTotal(j);
  const due = openBalance(j);
  const amountInvoiced = total > 0 ? fmt$(total) : j.amount ? String(j.amount) : "";
  const amountDue = due > 0 ? fmt$(due) : j.paid ? "Paid" : "";
  const dueDiffers =
    total > 0.01 && due > 0.01 && Math.abs(total - due) > 0.01 && !j.paid;
  const rows = [];
  if (docNo) rows.push({ label: isInv ? "Invoice #" : "Estimate #", value: String(docNo) });
  if (date) rows.push({ label: isInv ? "Invoice date" : "Date", value: date });
  if (address) rows.push({ label: "Service address", value: address });
  if (amountInvoiced) rows.push({ label: "Amount invoiced", value: amountInvoiced });
  if (dueDiffers && amountDue) {
    rows.push({ label: "Amount due", value: amountDue });
  } else if (!amountInvoiced && amountDue && amountDue !== "Paid") {
    rows.push({ label: "Amount due", value: amountDue });
  }
  return {
    docNo: docNo ? String(docNo) : "",
    date,
    address,
    amountInvoiced,
    amountDue: dueDiffers || (!amountInvoiced && amountDue && amountDue !== "Paid") ? amountDue : "",
    dueDiffers,
    rows,
  };
}

export function unsentDocPath(job, docKind) {
  if (!job?.id) return "";
  return "/job/" + encodeURIComponent(job.id) + "?doc=" + docKind;
}