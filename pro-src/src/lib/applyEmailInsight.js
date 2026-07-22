// Apply approved email-insight actions (calendar, paperwork, reminders).
import {
  appointmentTypeLabel,
  paperworkPatchForInsight,
  defaultActionKeys,
  canAutoApply,
  buildAppointmentDescription,
  addMinutesToLocalIso,
  APPOINTMENT_DURATION_MINUTES,
} from "./emailInsight.js";
import { inspectionAppointmentTitle } from "./paperwork.js";
import { calendarServiceLocation } from "./customerSync.js";
import { GCAL_RED_COLOR_ID } from "./calendarEventStyle.js";

export function calendarTitleForInsight(insight) {
  const type = insight?.appointmentType || "other";
  if (type === "inspection") return inspectionAppointmentTitle("Inspection appointment", insight?.dateTime);
  return appointmentTypeLabel(type);
}

/**
 * Force inspection defaults Levi requires for the test:
 * 1h + 1d reminders, share-with-customer when we have an email.
 */
export function ensureInspectionSelections(insight, job, selected) {
  const next = new Set(selected || []);
  if (insight?.appointmentType === "inspection") {
    next.add("remind_1h");
    next.add("remind_1d");
    if (job?.email) next.add("guest_email");
  }
  return next;
}

export function buildCalendarPayload(insight, job, selected) {
  const sel = ensureInspectionSelections(insight, job, selected);
  const dt = insight?.dateTime || "";
  // Prefer end from insight; otherwise duration from start (1 hour slot).
  const end =
    insight?.endDateTime ||
    (dt ? addMinutesToLocalIso(dt, APPOINTMENT_DURATION_MINUTES) : "");
  // Full street + city/state/zip when the job has it; fall back to email extract.
  const location =
    calendarServiceLocation(job) ||
    insight?.address ||
    job?.serviceAddress ||
    job?.address ||
    "";
  const title = calendarTitleForInsight(insight);
  const reminders = [];
  if (sel.has("remind_1h")) reminders.push({ label: "1h", minutes: 60 });
  if (sel.has("remind_1d")) reminders.push({ label: "1d", minutes: 1440 });
  const guests = [];
  if (sel.has("guest_email") && job?.email) guests.push(String(job.email).trim());
  // Customer-facing notes only — no leJobId tag (job is linked via calEventId).
  const description = buildAppointmentDescription(insight, job);
  const payload = {
    summary: title,
    start: dt || new Date().toISOString().slice(0, 16),
    end: end || undefined,
    durationMinutes: APPOINTMENT_DURATION_MINUTES,
    location: sel.has("calendar_location") ? location : location,
    description,
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

/**
 * Apply insight actions. When autoApply=true, marks status auto_applied
 * so the app can show a "done" notice instead of an approve sheet.
 */
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
  autoApply = false,
}) {
  let selected = new Set(
    selectedActionKeys?.length ? selectedActionKeys : defaultActionKeys(insight, job)
  );
  selected = ensureInspectionSelections(insight, job, selected);
  const jobId = job?.id || insight?.jobId || "today";
  const outcome = insight?.outcome || "other";
  const scheduleable = outcome !== "cancelled" && outcome !== "completed";
  let appliedEventId = "";

  if (selected.has("calendar") && insight?.dateTime && scheduleable) {
    const payload = buildCalendarPayload(insight, job, selected);
    const key = "emailins:" + (insight.id || insight.source?.messageId || Date.now());
    await enqueue("calendar_upsert", jobId, payload, "judgment", key);

    const pendingId = "pending-" + Date.now();
    appliedEventId = pendingId;
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
      end: payload.end,
      location: payload.location,
      description: payload.description,
      colorId: payload.colorId,
    });
    pullCalendarNow?.();
  } else if (job?.id) {
    const paper = jobPatchForInsight(insight, selected);
    if (paper && Object.keys(paper).length) {
      await patchAndSave(job.id, paper);
    }
  }

  const now = new Date().toISOString();
  await patchEmailInsight(insight.id, {
    status: autoApply ? "auto_applied" : "approved",
    approvedAt: now,
    appliedAt: now,
    autoApplied: !!autoApply,
    notified: false,
    jobId: job?.id || insight?.jobId || null,
    // So "Open schedule calendar" deep-links to this event.
    ...(appliedEventId ? { appliedEventId } : {}),
  });
  if (!autoApply) {
    showToast?.("Applied — syncing to calendar and job");
  }
}

export { canAutoApply, defaultActionKeys };
