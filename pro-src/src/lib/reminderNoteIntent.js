// Parse reminder-note text into actionable next steps (create invoice, estimate, email…).
import { classifyAppointment } from "./appointmentActions.js";

const INVOICE_RE =
  /\b(create|make|build|draft|send|need|please)\b[^.]{0,40}\binvoice\b|\binvoice\b[^.]{0,40}\b(create|make|from|with|using)\b/i;
const ESTIMATE_RE =
  /\b(create|make|build|draft|send|need|please)\b[^.]{0,40}\bestimate\b|\bestimate\b[^.]{0,40}\b(create|make|send)\b/i;
const EMAIL_INVOICE_RE = /\b(email|send|remind|nudge|check[\s-]?in)\b[^.]{0,50}\b(invoice|payment|paid|balance)\b/i;
const EMAIL_EST_RE = /\b(email|send|follow[\s-]?up|check[\s-]?in|nudge|approve)\b/i;

/** Detect what Levi wants from a free-text reminder note. */
export function parseReminderNote(note, job) {
  const text = (note || "").trim();
  if (!text) return null;

  if (INVOICE_RE.test(text)) {
    return { action: "create_invoice", label: "Create invoice now", needsJob: true };
  }
  if (ESTIMATE_RE.test(text)) {
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