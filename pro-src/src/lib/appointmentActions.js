// Appointment follow-up — classify job state, suggest actions, mood-based emails.
import { linkedJobForEvent } from "./calendarLink.js";

export const EMAIL_MOODS = [
  { key: "professional", label: "Professional", emoji: "💼" },
  { key: "friendly", label: "Friendly", emoji: "😊" },
  { key: "direct", label: "Direct & business", emoji: "📋" },
  { key: "casual", label: "Casual & funny", emoji: "😄" },
  { key: "urgent", label: "Urgent & firm", emoji: "⚡" },
];

/** Classify linked job paperwork state for appointment follow-ups. */
export function classifyAppointment(job) {
  if (!job) return "no_job";
  const hasEst = !!(
    job.estimateNo ||
    job._estimateConfirmed ||
    (job.estimateLines && job.estimateLines.length)
  );
  const hasInv = !!(job.invoiceNo || job._invoiceConfirmed);
  if (hasEst) return hasInv ? "job_estimate_and_invoice" : "job_estimate_pending";
  if (hasInv) return "job_invoice_only";
  return "job_no_docs";
}

export function appointmentContext(event, jobs) {
  const job = linkedJobForEvent(event, jobs);
  const scenario = classifyAppointment(job);
  return { job, scenario };
}

const COPY = {
  no_job: {
    title: "Create a job?",
    lead: "This appointment isn't linked to a job yet — want to set one up now?",
  },
  job_no_docs: {
    title: "Paperwork next?",
    lead: "You've got a job but no estimate or invoice yet. What do you want to tackle first?",
  },
  job_estimate_pending: {
    title: "Estimate follow-up",
    lead: "There's an estimate on this job. Follow up for approval, or turn it into an invoice when they're ready.",
  },
  job_estimate_and_invoice: {
    title: "Invoice & estimate",
    lead: "Estimate and invoice are both on file — nudge them on the estimate or chase the invoice.",
  },
  job_invoice_only: {
    title: "Invoice follow-up",
    lead: "Invoice is out — send a payment reminder or check in with the customer.",
  },
};

export function followUpCopy(scenario) {
  return COPY[scenario] || COPY.job_no_docs;
}

/** Three side-by-side actions on reminder popups — job, estimate, invoice. */
export function reminderQuickActions() {
  return [
    { key: "create_job", label: "Create a job", icon: "＋" },
    { key: "create_estimate", label: "Create an estimate", icon: "📝" },
    { key: "create_invoice", label: "Create an invoice", icon: "🧾" },
  ];
}

/** Action keys the UI can render as buttons. */
export function followUpActions(scenario) {
  const actions = [];
  if (scenario === "no_job") {
    actions.push({ key: "create_job", label: "Create a job", icon: "＋", primary: true });
    return actions;
  }
  if (scenario === "job_no_docs") {
    actions.push(
      { key: "create_estimate", label: "Create estimate", icon: "📝", primary: true },
      { key: "create_invoice", label: "Create invoice", icon: "🧾" }
    );
  } else if (scenario === "job_estimate_pending") {
    actions.push(
      { key: "email_followup", label: "Email — approve estimate", icon: "✉️", primary: true },
      { key: "create_invoice", label: "Create invoice", icon: "🧾" },
      { key: "open_job", label: "Open job", icon: "📂" }
    );
  } else if (scenario === "job_estimate_and_invoice") {
    actions.push(
      { key: "email_followup", label: "Email — estimate follow-up", icon: "✉️", primary: true },
      { key: "email_invoice", label: "Email — payment reminder", icon: "💰" },
      { key: "open_job", label: "Open job", icon: "📂" }
    );
  } else if (scenario === "job_invoice_only") {
    actions.push(
      { key: "email_invoice", label: "Email — payment reminder", icon: "💰", primary: true },
      { key: "open_job", label: "Open job", icon: "📂" }
    );
  }
  actions.push({ key: "remind", label: "Remind me later", icon: "🔔" });
  return actions;
}

function firstName(customer) {
  return (customer || "").trim().split(/\s+/)[0] || "there";
}

function estimateRef(job) {
  return job.estimateNo ? "estimate #" + job.estimateNo : "the estimate we sent";
}

function invoiceRef(job) {
  return job.invoiceNo ? "invoice #" + job.invoiceNo : "your invoice";
}

const SIGN = "— LE Electrical";

/** Generate a customer email draft for the chosen mood and scenario. */
export function generateFollowUpEmail(job, emailKind, mood) {
  const name = firstName(job.customer);
  const title = job.title || "your project";
  const est = estimateRef(job);
  const inv = invoiceRef(job);
  const addr = (job.address || "").trim();

  const templates = {
    estimate_approve: {
      professional: `Dear ${name},\n\nThank you for meeting with us regarding ${title}. Please review ${est} at your convenience and let us know if you'd like to proceed or have any questions.\n\n${SIGN}`,
      friendly: `Hi ${name}! 😊\n\nGreat talking with you about ${title}. Whenever you get a chance, take a look at ${est} — we're excited to get started if it looks good to you!\n\n${SIGN}`,
      direct: `Hi ${name},\n\nFollowing up on ${title}: ${est} is ready for your review. Reply with approval or questions and we'll move forward.\n\n${SIGN}`,
      casual: `Hey ${name}!\n\nSo… remember that ${title} thing? ${est} is sitting there like a puppy waiting at the door. Give it a thumbs-up when you're ready and we'll roll! 🐶⚡\n\n${SIGN}`,
      urgent: `Hi ${name},\n\nWe need your approval on ${est} for ${title} to keep your spot on the schedule. Please reply today so we can confirm your start date.\n\n${SIGN}`,
    },
    invoice_payment: {
      professional: `Dear ${name},\n\nThis is a courteous reminder regarding ${inv} for ${title}. Please let us know if you have any questions about the balance.\n\n${SIGN}`,
      friendly: `Hi ${name}! Hope you're doing well. Just a quick, friendly nudge on ${inv} for ${title} — no rush, but wanted to keep it on your radar. 😊\n\n${SIGN}`,
      direct: `Hi ${name},\n\n${inv} for ${title} is outstanding. Please arrange payment or contact us if there's an issue.\n\n${SIGN}`,
      casual: `Hey ${name} — your ${inv} for ${title} is doing the "tap tap, still here" thing. 😄 Let us know if you need anything!\n\n${SIGN}`,
      urgent: `Hi ${name},\n\n${inv} for ${title} is past due. Please submit payment promptly or call us today to avoid delays.\n\n${SIGN}`,
    },
    prep_estimate: {
      professional: `Dear ${name},\n\nThank you for your time${addr ? " at " + addr : ""}. We are preparing your estimate for ${title} and will send it shortly.\n\n${SIGN}`,
      friendly: `Hi ${name}! Thanks again for having us out${addr ? " to " + addr : ""}. We're putting together your estimate for ${title} and you'll have it soon! 😊\n\n${SIGN}`,
      direct: `Hi ${name},\n\nPer our visit${addr ? " at " + addr : ""}, your estimate for ${title} is in progress. Expect it within one business day.\n\n${SIGN}`,
      casual: `Hey ${name}! Fun visit${addr ? " at " + addr : ""} — we're crunching numbers for ${title} and the estimate is on its way. No calculator hamsters were harmed. 🔧\n\n${SIGN}`,
      urgent: `Hi ${name},\n\nYour estimate for ${title} is being finalized now. We'll send it today — watch for it in your inbox.\n\n${SIGN}`,
    },
  };

  const kind = emailKind === "invoice" ? "invoice_payment" : emailKind === "prep" ? "prep_estimate" : "estimate_approve";
  const pool = templates[kind] || templates.estimate_approve;
  return pool[mood] || pool.friendly;
}

export function emailKindForAction(actionKey, scenario) {
  if (actionKey === "email_invoice") return "invoice";
  if (actionKey === "email_followup" && scenario === "job_no_docs") return "prep";
  return "estimate";
}