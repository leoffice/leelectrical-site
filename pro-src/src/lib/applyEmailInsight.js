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
import { findEventForInsight, findPriorAppointmentsForInsight } from "./calendarNavigate.js";
import { conedPatchFromInsight } from "./conedPermit.js";
import { cityPatchFromInsight } from "./cityPermit.js";
import { mergeStatusPatches } from "./permitProgressBridge.js";

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
  // Red on calendar for inspections AND Con Ed meter installs (Winthrop-class).
  // Previously only inspection got colorId 11, so meter install recommendations stayed unflagged.
  if (
    insight?.appointmentType === "inspection" ||
    insight?.appointmentType === "meter_installation"
  ) {
    payload.colorId = GCAL_RED_COLOR_ID;
  }
  return payload;
}

/**
 * Merge classic paperwork date patch with ConEd open-case brain
 * (stage, case #, final-checklist auto-complete, permit record, job.status bridge).
 */
export function mergeConedIntoJobPatch(basePatch, insight, job) {
  const coned = conedPatchFromInsight(insight, job);
  if (!coned) return basePatch || {};
  const paper = { ...(basePatch?.paperwork || {}) };
  const baseConed = paper.coned || {};
  const fromBrain = coned.paperwork?.coned || {};
  paper.coned = {
    ...baseConed,
    ...fromBrain,
    enabled: true,
    steps: { ...(baseConed.steps || {}), ...(fromBrain.steps || {}) },
    dates: { ...(baseConed.dates || {}), ...(fromBrain.dates || {}) },
  };
  const status = mergeStatusPatches(
    basePatch?.status ? { status: basePatch.status } : {},
    coned.status ? { status: coned.status } : {}
  );
  return {
    ...(basePatch || {}),
    paperwork: paper,
    permits: coned.permits,
    ...(status.status ? { status: status.status } : {}),
  };
}

/**
 * Merge City/DOB NOW brain into the job patch (permit record + paperwork.dob
 * + job.status bridge). Safe no-op when the insight is not City.
 */
export function mergeCityIntoJobPatch(basePatch, insight, job) {
  const city = cityPatchFromInsight(insight, job);
  if (!city) return basePatch || {};
  const paper = { ...(basePatch?.paperwork || {}) };
  const baseDob = paper.dob || {};
  const fromBrain = city.paperwork?.dob || {};
  if (fromBrain && Object.keys(fromBrain).length) {
    paper.dob = {
      ...baseDob,
      ...fromBrain,
      enabled: true,
      steps: { ...(baseDob.steps || {}), ...(fromBrain.steps || {}) },
      dates: { ...(baseDob.dates || {}), ...(fromBrain.dates || {}) },
    };
  }
  // Prefer city permits when both brains ran; city fold starts from job.permits
  // which already may include Con Ed from a prior merge.
  const status = mergeStatusPatches(
    basePatch?.status ? { status: basePatch.status } : {},
    city.status ? { status: city.status } : {}
  );
  return {
    ...(basePatch || {}),
    paperwork: paper,
    permits: city.permits || basePatch?.permits,
    ...(status.status ? { status: status.status } : {}),
  };
}

export function jobPatchForInsight(insight, selected, job = null) {
  let base = {};
  if (
    selected.has("paperwork_inspection") ||
    selected.has("paperwork_meter") ||
    selected.has("paperwork_progress")
  ) {
    base = paperworkPatchForInsight(insight, insight?.dateTime) || {};
  }
  // Always run ConEd + City brains when the mail matches —
  // stages advance even on "already on calendar" / completed / no calendar select.
  // Bridge also flips top-level job.status so Progress matches Permits.
  let patch = mergeConedIntoJobPatch(base, insight, job);
  patch = mergeCityIntoJobPatch(patch, insight, job);
  return patch;
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
  removeLocalEvent,
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
  let replacedEventIds = [];

  // A reschedule moves ONE appointment. Remove the earlier booking first
  // so the job does not show twice (Levi 2026-07-27 — 1127 Lincoln Place).
  const isReschedule = outcome === "rescheduled";
  if (isReschedule && selected.has("calendar") && scheduleable) {
    const priors = findPriorAppointmentsForInsight(insight, job, events);
    for (const prior of priors) {
      const id = String(prior?.id || "").trim();
      if (!id) continue;
      if (!id.startsWith("pending-")) {
        await enqueue(
          "calendar_delete",
          job?.id || insight?.jobId || "today",
          { calEventId: id },
          "judgment",
          "caldel-resched:" + (insight?.id || "") + ":" + id
        );
      }
      removeLocalEvent?.(id);
      replacedEventIds.push(id);
    }
    if (job?.id && replacedEventIds.includes(String(job.calEventId || ""))) {
      await patchAndSave(job.id, { calEventId: "" });
    }
  }

  // Cross-check: already on calendar? Leave it alone (same day + address / same start).
  // For a reschedule this only fires when the NEW time is already booked.
  const existing = findEventForInsight(
    insight,
    isReschedule ? { ...(job || {}), calEventId: "" } : job,
    isReschedule ? events.filter((e) => !replacedEventIds.includes(String(e?.id))) : events
  );
  const wantsCal =
    selected.has("calendar") &&
    outcome !== "cancelled" &&
    outcome !== "completed" &&
    outcome !== "reminder";

  // Approved without a parseable date used to mark "approved" and never create the event
  // (Winthrop APPT-722669). Keep it pending so LE Pro keeps reminding.
  if (wantsCal && !insight?.dateTime && !existing) {
    const now = new Date().toISOString();
    await patchEmailInsight(insight.id, {
      status: "pending",
      skipReason: "needs_date",
      notified: false,
      autoApplied: false,
      updatedAt: now,
      jobId: job?.id || insight?.jobId || null,
    });
    if (!autoApply) {
      showToast?.("Couldn't read the appointment date from the email — left open for you");
    }
    return;
  }

  if (existing && selected.has("calendar") && scheduleable) {
    appliedEventId = existing.id || job?.calEventId || "";
    skipReason = "already_on_calendar";
    // Still sync paperwork + ConEd stage brain, but no calendar_upsert.
    if (job?.id) {
      const paper = jobPatchForInsight(insight, selected, job);
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
      const paper = jobPatchForInsight(insight, selected, job) || {};
      // Calendar set always marks Scheduled; bridge may add Paperwork/Done —
      // deep-merge status so neither side clobbers the other.
      const status = {
        Scheduled: { s: "done", d: insight.dateTime.slice(0, 10) },
        ...(paper.status || {}),
      };
      // If bridge already set Scheduled done with a date, keep its date.
      if (paper.status?.Scheduled?.s === "done") {
        status.Scheduled = paper.status.Scheduled;
      }
      const patch = {
        ...paper,
        calEventId: pendingId,
        status,
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
    // Paperwork-only path + ConEd stage (deposit, checklist, pass/fail, etc.)
    const paper = jobPatchForInsight(insight, selected, job);
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
    ...(replacedEventIds.length
      ? { replacedEventIds, replacedEventCount: replacedEventIds.length }
      : {}),
  });
  if (!autoApply) {
    showToast?.(
      skipReason === "already_on_calendar"
        ? "Already on your calendar — left it alone"
        : replacedEventIds.length
          ? replacedEventIds.length === 1
            ? "Moved — old appointment removed, new time booked"
            : `${replacedEventIds.length} old appointments removed — new time booked`
          : "Applied — syncing to calendar and job"
    );
  }
  return { appliedEventId, replacedEventIds, skipReason };
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
