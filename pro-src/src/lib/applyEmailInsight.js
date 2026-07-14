// Apply approved email-insight actions (calendar, paperwork, reminders).
import { withJobLink } from "./calendarLink.js";
import { appointmentTypeLabel, paperworkPatchForInsight } from "./emailInsight.js";
import { inspectionAppointmentTitle } from "./paperwork.js";
const GCAL_RED_COLOR_ID = "11";

export function calendarTitleForInsight(insight) {
  const type = insight?.appointmentType || "other";
  if (type === "inspection") return inspectionAppointmentTitle("Inspection appointment", insight?.dateTime);
  return appointmentTypeLabel(type);
}

export function buildCalendarPayload(insight, job, selected) {
  const dt = insight?.dateTime || "";
  const location = insight?.address || job?.serviceAddress || job?.address || "";
  const title = calendarTitleForInsight(insight);
  const reminders = [];
  if (selected.has("remind_1h")) reminders.push({ label: "1h", minutes: 60 });
  if (selected.has("remind_1d")) reminders.push({ label: "1d", minutes: 1440 });
  const guests = [];
  if (selected.has("guest_email") && job?.email) guests.push(String(job.email).trim());
  const payload = {
    summary: title,
    start: dt || new Date().toISOString().slice(0, 16),
    location: selected.has("calendar_location") ? location : location,
    description: job?.id ? withJobLink("From Energy Services email", job.id) : "From Energy Services email",
    guests,
    attendees: guests,
    reminders,
    notifyCustomer: guests.length > 0,
  };
  if (insight?.appointmentType === "inspection") payload.colorId = GCAL_RED_COLOR_ID;
  return payload;
}

export function jobPatchForInsight(insight, selected) {
  if (!selected.has("paperwork_inspection") && !selected.has("paperwork_meter") && !selected.has("paperwork_progress")) {
    return {};
  }
  return paperworkPatchForInsight(insight, insight?.dateTime);
}

export async function applyEmailInsight({
  insight,
  job,
  selectedActionKeys,
  enqueue,
  patchAndSave,
  patchEmailInsight,
  appendLocalEvent,
  pullCalendarNow,
  showToast,
}) {
  const selected = new Set(selectedActionKeys || []);
  const jobId = job?.id || insight?.jobId || "today";

  if (selected.has("calendar") && insight?.dateTime) {
    const payload = buildCalendarPayload(insight, job, selected);
    const key = "emailins:" + (insight.id || insight.source?.messageId || Date.now());
    await enqueue("calendar_upsert", jobId, payload, "judgment", key);

    const pendingId = "pending-" + Date.now();
    if (job?.id) {
      const patch = {
        calEventId: pendingId,
        status: { Scheduled: { s: "done", d: insight.dateTime.slice(0, 10) } },
        ...jobPatchForInsight(insight, selected),
      };
      await patchAndSave(job.id, patch);
    }

    appendLocalEvent?.({
      id: pendingId,
      summary: payload.summary,
      start: payload.start,
      location: payload.location,
      description: payload.description,
      colorId: payload.colorId,
    });
    pullCalendarNow?.();
  } else if (job?.id && jobPatchForInsight(insight, selected) && Object.keys(jobPatchForInsight(insight, selected)).length) {
    await patchAndSave(job.id, jobPatchForInsight(insight, selected));
  }

  await patchEmailInsight(insight.id, { status: "approved", approvedAt: new Date().toISOString() });
  showToast?.("Applied — syncing to calendar and job");
}