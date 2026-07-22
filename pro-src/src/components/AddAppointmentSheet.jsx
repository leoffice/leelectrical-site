// Create or edit a Google Calendar appointment — week view, reminders, guest notify.
import React, { useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import WeekCalendar from "./WeekCalendar.jsx";
import { useStore } from "../state/store.jsx";
import LocationSuggestField from "./LocationSuggestField.jsx";
import { calendarServiceLocation } from "../lib/customerSync.js";
import { displayEventNotes, withJobLink } from "../lib/calendarLink.js";
import { DATE_STEPS, inspectionAppointmentTitle } from "../lib/paperwork.js";
import { evStart, todayStr } from "../lib/format.js";
import { stashCalendarPick } from "../lib/calendarNavigate.js";
import { productName, tenantCalendarAccount } from "../lib/tenantBranding.js";
import { useTenantConfig } from "../state/tenant.jsx";

import { GCAL_RED_COLOR_ID, isInspectionEvent } from "../lib/calendarEventStyle.js";

export { GCAL_RED_COLOR_ID, isInspectionEvent };

function jobDefaultSummary(job) {
  if (!job) return "";
  const cust = job.businessName || job.customer || "";
  const title = job.title || "Job";
  return cust ? title + " — " + cust : title;
}

function jobDefaultNotes(job) {
  if (!job) return "";
  const parts = [];
  if (job.personName) parts.push(job.personName);
  if (job.phone) parts.push("phone: " + job.phone);
  if (job.email) parts.push(job.email);
  if (job.description) parts.push(job.description);
  return parts.join("\n");
}

function jobDefaultDate(job, defaultDate) {
  if (defaultDate) return defaultDate.includes("T") ? defaultDate : defaultDate + "T09:00";
  const d = job?.status?.Scheduled?.d || job?.followUp?.date || todayStr();
  return d ? d + "T09:00" : "";
}

function toLocalInput(start) {
  const s = (start || "").replace(" ", "T");
  if (!s) return "";
  if (s.length === 10) return s + "T09:00";
  return s.slice(0, 16);
}

/** Duplicate lands one week out so the copy is obvious on the calendar grid. */
function duplicateDefaultDate(fromDt) {
  if (!fromDt) return "";
  const base = fromDt.includes("T") ? fromDt : fromDt + "T09:00";
  try {
    const d = new Date(base);
    d.setDate(d.getDate() + 7);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${base.slice(11, 16) || "09:00"}`;
  } catch {
    return base;
  }
}

function formatApptWhen(dt) {
  if (!dt) return "";
  return dt.replace("T", " ").slice(0, 16);
}

function initialReminders(ev) {
  const r = ev?.reminders;
  if (!Array.isArray(r) || !r.length) return null;
  return {
    h1: r.some((x) => x.minutes === 60),
    d1: r.some((x) => x.minutes === 1440),
  };
}

function initialGuest(ev, job) {
  const guests = ev?.guests || ev?.attendees || [];
  const email = Array.isArray(guests) ? String(guests[0] || "").trim() : "";
  return {
    notify: !!email || !!job?.email,
    email: email || job?.email || "",
  };
}

export default function AddAppointmentSheet({
  defaultDate,
  defaultSummary,
  defaultLocation,
  defaultNotes,
  duplicateFrom,
  editEvent,
  inspectionPreset,
  job,
  onClose,
  onSaved,
  onDelete,
  onDuplicate,
  showCalendar = true,
  /** When true, render as an in-page card (calendar already above on Today). */
  inline = false,
}) {
  const { events, jobs, api, enqueue, showToast, patchAndSave, patchJob, appendLocalEvent, pullCalendarNow } = useStore();
  const product = productName(useTenantConfig());
  const isDuplicate = !!duplicateFrom;
  const isEdit = !!editEvent && !isDuplicate;
  const fromInspection = !!inspectionPreset?.step || (isEdit && isInspectionEvent(editEvent));
  const presetDt = defaultDate || (fromInspection && inspectionPreset ? inspectionPreset?.date : "");
  const presetReminders = isEdit ? initialReminders(editEvent) : null;
  const presetGuest = isEdit ? initialGuest(editEvent, job) : null;
  // One save per form open — double-taps used to create multiple Google events (unique Date.now keys).
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const dupIdempotencyRef = useRef(null);

  const [summary, setSummary] = useState(() => {
    if (isEdit) return editEvent.summary || "";
    if (defaultSummary) return defaultSummary;
    if (inspectionPreset?.step) return inspectionAppointmentTitle(inspectionPreset.step, presetDt);
    return jobDefaultSummary(job);
  });
  const [dt, setDt] = useState(() => {
    if (isEdit) return toLocalInput(evStart(editEvent));
    const raw = jobDefaultDate(job, presetDt);
    return isDuplicate ? duplicateDefaultDate(raw) : raw;
  });
  const [location, setLocation] = useState(() => {
    if (isEdit) return editEvent.location || "";
    return defaultLocation ?? (job ? calendarServiceLocation(job) : "");
  });
  const [notes, setNotes] = useState(() => {
    if (isEdit) return displayEventNotes(editEvent.description) || "";
    return defaultNotes ?? jobDefaultNotes(job);
  });
  const [remind1h, setRemind1h] = useState(() =>
    presetReminders ? presetReminders.h1 : fromInspection
  );
  const [remind1d, setRemind1d] = useState(() =>
    presetReminders ? presetReminders.d1 : fromInspection
  );
  const [notifyCustomer, setNotifyCustomer] = useState(() =>
    presetGuest ? presetGuest.notify : !!job?.email
  );
  const [guestEmail, setGuestEmail] = useState(() =>
    presetGuest ? presetGuest.email : job?.email || ""
  );

  const pickDay = (dayKey) => {
    const time = dt && dt.includes("T") ? dt.slice(11, 16) : "09:00";
    setDt(dayKey + "T" + time);
  };

  const buildNotifyPayload = () => {
    const guests = notifyCustomer && guestEmail.trim() ? [guestEmail.trim()] : [];
    const reminders = [];
    if (remind1h) reminders.push({ label: "1h", minutes: 60 });
    if (remind1d) reminders.push({ label: "1d", minutes: 1440 });
    return {
      guests,
      attendees: guests,
      reminders,
      notifyCustomer: notifyCustomer && guests.length > 0,
    };
  };

  const save = async () => {
    if (savingRef.current) return;
    const title = (summary || "").trim();
    if (!title) return showToast("Add a title for the appointment");
    if (!dt) return showToast("Pick date and time");
    savingRef.current = true;
    setSaving(true);
    const notify = buildNotifyPayload();

    try {
      if (isEdit) {
        const eventId = editEvent.id || "";
        const busId = job?.id || "today";
        // Descriptions are written into the Google Calendar event itself, so a
        // rename only affects events created afterwards — anything reading these
        // back must tolerate both the old and the current product name.
        const description = job?.id ? withJobLink(notes, job.id) : notes || `Updated in ${product}`;
        const payload = {
          calEventId: eventId,
          summary: title,
          start: dt,
          location: location || "",
          description,
          ...notify,
        };
        if (fromInspection) payload.colorId = GCAL_RED_COLOR_ID;
        else if (editEvent.colorId) payload.colorId = editEvent.colorId;

        await enqueue(
          "calendar_upsert",
          busId,
          payload,
          "judgment",
          "caledit:" + (eventId || dt) + ":" + title.slice(0, 24)
        );
        const patch = {
          id: eventId || "pending-" + Date.now(),
          summary: title,
          start: dt,
          location: location || "",
          description,
        };
        appendLocalEvent({ ...editEvent, ...patch });
        pullCalendarNow();
        showToast("Appointment updated — syncing to calendar");
        onSaved?.({ ...editEvent, ...patch });
        onClose();
        return;
      }

      const busId = job?.id || "today";
      const created = `Created in ${product}`; // also stored on the Google event — see note above
      const description = job ? withJobLink(notes || created, job.id) : notes || created;
      // Stable key for this form open so a second tap cannot mint a second Google event.
      if (isDuplicate && !dupIdempotencyRef.current) {
        dupIdempotencyRef.current =
          "caldup:" + (duplicateFrom?.id || "x") + ":" + Date.now() + ":" + dt + ":" + title.slice(0, 24);
      }
      const key = isDuplicate
        ? dupIdempotencyRef.current
        : (job ? "jobcal:" + job.id : "todaycal:") + ":" + dt + ":" + title.slice(0, 24);

      const payload = {
        summary: title,
        start: dt,
        location: location || "",
        description,
        ...notify,
      };
      if (!isDuplicate && job?.calEventId) payload.calEventId = job.calEventId;
      if (fromInspection) payload.colorId = GCAL_RED_COLOR_ID;

      await enqueue("calendar_upsert", busId, payload, "judgment", key);

      const pendingId = "pending-" + Date.now();
      const paperworkPatch =
        fromInspection && job?.id && inspectionPreset?.branch && inspectionPreset?.step
          ? {
              paperwork: {
                [inspectionPreset.branch]: {
                  dates: {
                    [inspectionPreset.step]:
                      (DATE_STEPS[inspectionPreset.step] || "date") === "datetime" ? dt : dt.slice(0, 10),
                  },
                },
              },
            }
          : {};

      if (job?.id && !isDuplicate && !job._customerContext) {
        const day = dt.slice(0, 10);
        await patchAndSave(job.id, {
          calEventId: pendingId,
          status: { Scheduled: { s: "done", d: day } },
          ...paperworkPatch,
        });
      } else if (job?.id && !isDuplicate) {
        patchJob(job.id, { calEventId: pendingId, ...paperworkPatch });
      }

      appendLocalEvent({
        id: pendingId,
        summary: title,
        start: dt,
        location: location || "",
        description,
      });
      // Don't deep-link when already editing under the Today calendar — that
      // would swap the open card and kill the post-duplicate chooser.
      if (!inline) stashCalendarPick(pendingId);
      pullCalendarNow();
      showToast(
        isDuplicate
          ? "Duplicate saved for " + formatApptWhen(dt) + " — syncing to Google Calendar"
          : job
            ? "Appointment queued for " + (job.customer || "job")
            : "Appointment queued — syncs to Google Calendar"
      );
      onSaved?.({ id: pendingId, summary: title, start: dt, location: location || "", description });
      onClose();
    } catch {
      savingRef.current = false;
      setSaving(false);
      showToast("Couldn't save appointment — try again");
    }
  };

  const sheetTitle = isEdit
    ? "Edit appointment"
    : isDuplicate
      ? "Duplicate appointment"
      : job
        ? "Add appointment — " + (job.customer || "job")
        : "Add appointment";

  // When embedded under the Today calendar, hide the nested week grid so the
  // page layout is: calendar on top → edit form below.
  const showEmbeddedCal = showCalendar && !inline;

  const body = (
    <>
      {isEdit && job?.id ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-2">Linked to job {job.id}.</p>
      ) : null}
      {isDuplicate ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-2">
          {job
            ? "New copy stays linked to the same job — date bumped one week out; change it below if you want."
            : "Fresh copy — date bumped one week out; change it below if you want."}
        </p>
      ) : fromInspection ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-2">
          Inspection — syncs as <span className="text-red-600 font-semibold">light red</span> with guest + reminders.
        </p>
      ) : !isEdit && job ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-2">
          Pre-filled from {job._customerContext ? "customer" : "job"} info — writes to{" "}
          {tenantCalendarAccount()}
        </p>
      ) : null}

      {showEmbeddedCal ? (
        <div className="mb-4" data-testid="appt-week-calendar">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Calendar — see what&apos;s booked</p>
          <WeekCalendar events={events} embedded onAddDay={pickDay} />
        </div>
      ) : null}

      <Fld label="Title" hint="What shows on the calendar">
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Appointment title" />
      </Fld>
      <Fld label="Date & time" hint="Tap a day above or pick here">
        <input
          className="input"
          type="datetime-local"
          value={dt}
          onChange={(e) => setDt(e.target.value)}
          aria-label="Appointment date and time"
          data-testid="appt-datetime"
        />
      </Fld>
      <LocationSuggestField
        job={job}
        jobs={jobs}
        events={events}
        value={location}
        onChange={setLocation}
        suggestAddresses={api.suggestAddresses?.bind(api)}
        hint="Your saved addresses first, then real-world matches as you type"
      />
      <Fld label="Notes" hint="Phone, details (optional)">
        <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
      </Fld>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-2 mb-2">Reminders</p>
      <label className="flex items-center gap-2 text-sm text-slate-600 mb-2 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" checked={remind1h} onChange={(e) => setRemind1h(e.target.checked)} />
        1 hour reminder
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600 mb-3 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" checked={remind1d} onChange={(e) => setRemind1d(e.target.checked)} />
        1 day reminder
      </label>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Notify customer</p>
      <label className="flex items-center gap-2 text-sm text-slate-600 mb-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={notifyCustomer}
          onChange={(e) => setNotifyCustomer(e.target.checked)}
          data-testid="notify-customer-toggle"
        />
        Add customer as calendar guest (invite email)
      </label>
      {notifyCustomer ? (
        <Fld label="Guest email" hint="Goes in Google Calendar Add guests field">
          <input
            className="input"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder={job?.email || "customer@email.com"}
            aria-label="Guest email"
            data-testid="guest-email"
          />
        </Fld>
      ) : null}

      <button
        type="button"
        className="btn-brand w-full"
        onClick={save}
        disabled={saving}
        data-testid="appt-save"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Save & sync to calendar"}
      </button>
      {onDuplicate ? (
        <button type="button" className="btn bg-brand-soft text-brand w-full mt-2" onClick={onDuplicate}>
          Duplicate (same job link)
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="btn-ghost w-full mt-2 text-red-600" onClick={onDelete}>
          Delete appointment
        </button>
      ) : null}
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Syncs to {tenantCalendarAccount()} — appears on Today after sync.
      </p>
    </>
  );

  if (inline) {
    return (
      <div
        className="rounded-2xl border border-brand/25 bg-white shadow-md overflow-hidden"
        data-testid="appt-edit-inline"
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-slate-100">
          <h3 className="font-extrabold text-slate-900 text-base flex-1 truncate">{sheetTitle}</h3>
          <button
            type="button"
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4" data-testid="sheet-body">
          {body}
        </div>
      </div>
    );
  }

  return (
    <Sheet title={sheetTitle} onClose={onClose} wide>
      {body}
    </Sheet>
  );
}