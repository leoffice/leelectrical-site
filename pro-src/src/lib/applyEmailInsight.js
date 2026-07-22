// Apply approved email-insight actions (calendar, paperwork, reminders).
import {
  appointmentTypeLabel,
  paperworkPatchForInsight,
  defaultActionKeys,
  canAutoApply,
  wantsNewCalendarAppointment,
  buildAppointmentDescription,
  addMinutesToLocalIso,
  APPOINTMENT_DURATION_MINUTES,
} from "./emailInsight.js";
import { inspectionAppointmentTitle } from "./paperwork.js";
import { calendarServiceLocation } from "./customerSync.js";
import { GCAL_RED_COLOR_ID } from "./calendarEventStyle.js";
import { findEventForInsight } from "./calendarNavigate.js";

/** Local clock label from insight dateTime for short calendar titles. */
function titleTimeFromInsight(insight) {
  const dt = insight?.dateTime || insight?.exactDateTime || "";
  if (!dt || !dt.includes("T")) return "";
  const t = dt.split("T")[1] || "";
  const [hh, mm] = t.split(":");
  const hour = Number(hh);
  if (!Number.isFinite(hour)) return "";
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${mm || "00"} ${ampm}`;
}

/**
 * Calendar title — time only (date lives on the day column).
 * City vs Con Edison named clearly. Meter install never ships as bare "appointment".
 */
export function calendarTitleForInsight(insight) {
  const type = insight?.appointmentType || "other";
  const agency = insight?.agency || "";
  const clock = titleTimeFromInsight(insight);
  if (type === "inspection") {
    if (agency === "city") {
      const base = "City electrical inspection";
      return clock ? `${base} — ${clock}` : base;
    }
    return inspectionAppointmentTitle("Inspection appointment", insight?.dateTime);
  }
  if (type === "meter_installation") {
    // Short week-grid title; full "Con Edison meter installation appointment" lives in notes.
    const base = agency === "coned" ? "Meter installation" : "Meter installation";
    return clock ? `${base} — ${clock}` : base;
  }
  // Never leave a useless bare "appointment" on the week grid.
  const label = appointmentTypeLabel(type, agency);
  if (!label || /^appointment$/i.test(label)) {
    return clock ? `Appointment — ${clock}` : "Appointment";
  }
  return clock && !/—/.test(label) ? `${label} — ${clock}` : label;
}

/**
 * Force meter-install defaults: 1h + 1d reminders (same as inspection),
 * share-with-customer when we have an email.
 */
export function ensureMeterInstallSelections(insight, job, selected) {
  const next = new Set(selected || []);
  if (insight?.appointmentType === "meter_installation") {
    next.add("remind_1h");
    next.add("remind_1d");
    if (job?.email) next.add("guest_email");
  }
  return next;
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
  let sel = ensureInspectionSelections(insight, job, selected);
  sel = ensureMeterInstallSelections(insight, job, sel);
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
  // Job.email may be "a@x.com, b@y.com" — split so Google Calendar accepts each guest.
  const guests = [];
  if (sel.has("guest_email") && job?.email) {
    for (const part of String(job.email).split(/[,;\s]+/)) {
      const e = part.trim();
      if (e && e.includes("@") && !guests.includes(e)) guests.push(e);
    }
  }
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
 *
 * Cross-checks the live calendar first (Levi 2026-07-22): if the appointment
 * is already scheduled, leave it alone — no second event, no re-invite.
 * New appointment sets create the event and email the customer when we have email.
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
  events = [],
}) {
  let selected = new Set(
    selectedActionKeys?.length ? selectedActionKeys : defaultActionKeys(insight, job)
  );
  selected = ensureInspectionSelections(insight, job, selected);
  selected = ensureMeterInstallSelections(insight, job, selected);
  const jobId = job?.id || insight?.jobId || "today";
  const outcome = insight?.outcome || "other";
  const scheduleable = wantsNewCalendarAppointment(insight) && outcome !== "cancelled" && outcome !== "completed";
  let appliedEventId = "";
  let skipReason = "";
  let customerEmailed = false;

  // Cross-check: already on calendar? Leave it alone (same day + address / same start).
  // Also catches original + forwarded Con Ed emails that would otherwise double-book.
  const existing = findEventForInsight(insight, job, events);
  if (existing && selected.has("calendar") && scheduleable) {
    appliedEventId = existing.id || job?.calEventId || "";
    skipReason = "already_on_calendar";
    // Still sync paperwork if needed, but no calendar_upsert.
    if (job?.id) {
      const paper = jobPatchForInsight(insight, selected);
      if (paper && Object.keys(paper).length) {
        await patchAndSave(job.id, {
          ...paper,
          ...(appliedEventId && !String(job.calEventId || "").startsWith("pending-")
            ? { calEventId: appliedEventId }
            : {}),
        });
      }
    }
  } else if (selected.has("calendar") && insight?.dateTime && scheduleable) {
    const payload = buildCalendarPayload(insight, job, selected);
    // Always email the customer invite when we have their address (Levi: "then email").
    if (job?.email && !payload.guests?.length) {
      const emails = [];
      for (const part of String(job.email).split(/[,;\s]+/)) {
        const e = part.trim();
        if (e && e.includes("@") && !emails.includes(e)) emails.push(e);
      }
      payload.guests = emails;
      payload.attendees = emails;
      payload.notifyCustomer = emails.length > 0;
    }
    customerEmailed = !!(payload.notifyCustomer && payload.guests?.length);
    payload.sendUpdates = customerEmailed ? "all" : "none";
    // Stable key by place+start so original + forward of the same set don't double-create.
    const placeKey = String(insight.address || job?.serviceAddress || job?.address || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24);
    const whenKey = String(insight.dateTime || "").slice(0, 16);
    const key =
      "emailins:" +
      (placeKey && whenKey
        ? `${placeKey}:${whenKey}`
        : insight.id || insight.source?.messageId || Date.now());
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
    ...(skipReason ? { skipReason } : {}),
    ...(customerEmailed ? { customerEmailed: true } : {}),
    // So "Open schedule calendar" deep-links to this event.
    ...(appliedEventId ? { appliedEventId } : {}),
  });
  if (!autoApply) {
    showToast?.(
      skipReason === "already_on_calendar"
        ? "Already on your calendar — left it alone"
        : "Applied — syncing to calendar and job"
    );
  }
}

/**
 * Dismiss the insight and, if a matching appointment is already on the
 * calendar, cancel/delete it (Levi: "Ignore and cancel").
 * Does not create anything new.
 */
export async function cancelEmailInsightAppointment({
  insight,
  job,
  events = [],
  enqueue,
  patchAndSave,
  patchEmailInsight,
  removeLocalEvent,
  pullCalendarNow,
  showToast,
}) {
  const existing = findEventForInsight(insight, job, events);
  const eventId = existing?.id || job?.calEventId || insight?.appliedEventId || "";
  const realId = String(eventId || "").trim();
  const isPending = realId.startsWith("pending-");
  let cancelled = false;

  if (realId && !isPending) {
    const jobId = job?.id || insight?.jobId || "today";
    await enqueue(
      "calendar_delete",
      jobId,
      { calEventId: realId },
      "judgment",
      "caldel-insight:" + (insight?.id || realId)
    );
    cancelled = true;
  } else if (realId && isPending) {
    // Optimistic local-only row — drop it; no Google id yet.
    cancelled = true;
  }

  if (realId) {
    removeLocalEvent?.(realId);
    if (job?.id && String(job.calEventId || "") === realId) {
      await patchAndSave?.(job.id, { calEventId: "" });
    }
    pullCalendarNow?.();
  }

  const now = new Date().toISOString();
  if (insight?.id) {
    await patchEmailInsight(insight.id, {
      status: "ignored",
      ignoreReason: cancelled ? "ignore_and_cancel" : "ignored",
      cancelledEventId: cancelled ? realId : "",
      notified: true,
      appliedAt: now,
      jobId: job?.id || insight?.jobId || null,
    });
  }

  if (cancelled) {
    showToast?.("Appointment cancelled — removed from your calendar");
  } else {
    showToast?.("Ignored — no calendar appointment to cancel");
  }
  return { cancelled, eventId: cancelled ? realId : "" };
}

export { canAutoApply, defaultActionKeys, wantsNewCalendarAppointment };
