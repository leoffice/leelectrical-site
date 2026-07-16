// Parse reminder-note text into actionable next steps (create invoice, estimate, email…).
import { classifyAppointment } from "./appointmentActions.js";

/** Explicit create-new language (not "make sure" / "have updated"). */
const CREATE_INVOICE_RE =
  /\b(create|build|draft|new)\b[^.]{0,40}\binvoice\b|\binvoice\b[^.]{0,40}\b(create|build|draft|new|from|with|using)\b|\b(need|please)\s+(an?\s+)?invoice\b|\bsend\s+(an?\s+)?invoice\b/i;
const CREATE_ESTIMATE_RE =
  /\b(create|build|draft|new|make)\b[^.]{0,40}\bestimate\b|\bestimate\b[^.]{0,40}\b(create|build|draft|new|send|make)\b|\b(need|please)\s+(an?\s+)?estimate\b/i;
const EMAIL_INVOICE_RE =
  /\b(email|send|remind|nudge|check[\s-]?in|follow[\s-]?up|chase|payment)\b[^.]{0,50}\b(invoice|payment|paid|balance)\b/i;
const EMAIL_EST_RE = /\b(email|send|follow[\s-]?up|check[\s-]?in|nudge|approve)\b/i;

/** "Make sure they have updated invoice" / verify existing paperwork — not create. */
const VERIFY_INVOICE_RE =
  /\b(make\s+sure|ensure|verify|confirm|check|updated?|have|has|already|existing|on\s+file)\b[^.]{0,50}\binvoice\b|\binvoice\b[^.]{0,50}\b(updated?|ready|sent|paid|status|on\s+file|exists?|already)\b/i;
const VERIFY_ESTIMATE_RE =
  /\b(make\s+sure|ensure|verify|confirm|check|updated?|have|has|already|existing|on\s+file)\b[^.]{0,50}\bestimate\b|\bestimate\b[^.]{0,50}\b(updated?|ready|sent|approved|status|on\s+file|exists?|already)\b/i;

function jobHasInvoice(job) {
  return !!(job?.invoiceNo || job?._invoiceConfirmed);
}

function jobHasEstimate(job) {
  return !!(job?.estimateNo || job?._estimateConfirmed || (job?.estimateLines && job.estimateLines.length));
}

/** Detect what Levi wants from a free-text reminder note. */
export function parseReminderNote(note, job) {
  const text = (note || "").trim();
  if (!text) return null;

  // Existing paperwork follow-ups first — never invent "create" from "make sure / updated".
  if (VERIFY_INVOICE_RE.test(text) && !CREATE_INVOICE_RE.test(text)) {
    if (jobHasInvoice(job) || !job?.id) {
      return { action: "email_invoice", label: "Email payment reminder", needsJob: true };
    }
  }
  if (VERIFY_ESTIMATE_RE.test(text) && !CREATE_ESTIMATE_RE.test(text)) {
    if (jobHasEstimate(job) || !job?.id) {
      return { action: "email_followup", label: "Email estimate follow-up", needsJob: true };
    }
  }

  if (CREATE_INVOICE_RE.test(text)) {
    // Already has an invoice — don't push "create" again.
    if (jobHasInvoice(job)) {
      return { action: "email_invoice", label: "Email payment reminder", needsJob: true };
    }
    return { action: "create_invoice", label: "Create invoice now", needsJob: true };
  }
  if (CREATE_ESTIMATE_RE.test(text)) {
    if (jobHasEstimate(job)) {
      return { action: "email_followup", label: "Email estimate follow-up", needsJob: true };
    }
    return { action: "create_estimate", label: "Create estimate now", needsJob: true };
  }
  if (EMAIL_INVOICE_RE.test(text)) {
    return { action: "email_invoice", label: "Email payment reminder", needsJob: true };
  }
  if (EMAIL_EST_RE.test(text)) {
    return { action: "email_followup", label: "Email estimate follow-up", needsJob: true };
  }

  const scenario = classifyAppointment(job);
  if (scenario === "job_no_docs" && /\b(paperwork|quote|bid)\b/i.test(text)) {
    return { action: "create_estimate", label: "Create estimate now", needsJob: true };
  }
  if (scenario === "job_estimate_pending" && /\b(approve|approval|next\s*step|ready)\b/i.test(text)) {
    return { action: "email_followup", label: "Email estimate follow-up", needsJob: true };
  }

  return null;
}

/** Job-detail path for a parsed intent (invoice/estimate builder). */
export function reminderIntentJobPath(intent, jobId) {
  if (!intent || !jobId) return "";
  if (intent.action === "create_invoice") {
    return "/job/" + encodeURIComponent(jobId) + "?doc=invoice&create=1";
  }
  if (intent.action === "create_estimate") {
    return "/job/" + encodeURIComponent(jobId) + "?doc=estimate&create=1";
  }
  return "";
}

/** Whether the intent opens a doc builder on the job screen. */
export function intentOpensDocBuilder(intent) {
  return intent?.action === "create_invoice" || intent?.action === "create_estimate";
}
