// Create a Google Calendar appointment — week view for availability, reminders, guest notify.
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import WeekCalendar from "./WeekCalendar.jsx";
import { useStore } from "../state/store.jsx";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { withJobLink } from "../lib/calendarLink.js";
import { DATE_STEPS, inspectionAppointmentTitle } from "../lib/paperwork.js";
import { todayStr } from "../lib/format.js";

/** Google Calendar colorId 11 = red (Tomato). */
export const GCAL_RED_COLOR_ID = "11";

function jobDefaultSummary(job) {
  if (!job) return "";
  const cust = job.customer || job.businessName || "";
  const title = job.title || "Job";
  return cust ? title + " — " + cust : title;
}

function jobDefaultNotes(job) {
  if (!job) return "";
  const parts = [];
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

export default function AddAppointmentSheet({
  defaultDate,
  defaultSummary,
  inspectionPreset,
  job,
  onClose,
  onSaved,
  showCalendar = true,
}) {
  const { events, enqueue, showToast, patchAndSave, patchJob, appendLocalEvent, pullCalendarNow } = useStore();
  const fromInspection = !!inspectionPreset?.step;
  const presetDt = defaultDate || (fromInspection ? inspectionPreset?.date : "");
  const [summary, setSummary] = useState(() => {
    if (defaultSummary) return defaultSummary;
    if (fromInspection) return inspectionAppointmentTitle(inspectionPreset.step, presetDt);
    return jobDefaultSummary(job);
  });
  const [dt, setDt] = useState(() => jobDefaultDate(job, presetDt));
  const [location, setLocation] = useState(() => (job ? effectiveServiceAddress(job) : ""));
  const [notes, setNotes] = useState(() => jobDefaultNotes(job));
  const [remind1h, setRemind1h] = useState(fromInspection);
  const [remind1d, setRemind1d] = useState(fromInspection);
  const [notifyCustomer, setNotifyCustomer] = useState(!!job?.email);
  const [guestEmail, setGuestEmail] = useState(job?.email || "");

  const pickDay = (dayKey) => {
    const time = dt && dt.includes("T") ? dt.slice(11, 16) : "09:00";
    setDt(dayKey + "T" + time);
  };

  const save = async () => {
    const title = (summary || "").trim();
    if (!title) return showToast("Add a title for the appointment");
    if (!dt) return showToast("Pick date and time");
    const busId = job?.id || "today";
    const description = job ? withJobLink(notes || "Created in LE Pro", job.id) : notes || "Created in LE Pro";
    const key = (job ? "jobcal:" + job.id : "todaycal:") + ":" + dt + ":" + title.slice(0, 24);
    const guests = notifyCustomer && guestEmail.trim() ? [guestEmail.trim()] : [];
    const reminders = [];
    if (remind1h) reminders.push({ label: "1h", minutes: 60 });
    if (remind1d) reminders.push({ label: "1d", minutes: 1440 });

    const payload = {
      calEventId: job?.calEventId || "",
      summary: title,
      start: dt,
      location: location || "",
      description,
      guests,
      attendees: guests,
      reminders,
      notifyCustomer: notifyCustomer && guests.length > 0,
    };
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

    if (job?.id && !job._customerContext) {
      const day = dt.slice(0, 10);
      await patchAndSave(job.id, {
        calEventId: pendingId,
        status: { Scheduled: { s: "done", d: day } },
        ...paperworkPatch,
      });
    } else if (job?.id) {
      patchJob(job.id, { calEventId: pendingId, ...paperworkPatch });
    }

    appendLocalEvent({
      id: pendingId,
      summary: title,
      start: dt,
      location: location || "",
      description,
    });
    pullCalendarNow();
    showToast(job ? "Appointment queued for " + (job.customer || "job") : "Appointment queued — syncs to Google Calendar");
    onSaved?.();
    onClose();
  };

  return (
    <Sheet title={job ? "Add appointment — " + (job.customer || "job") : "Add appointment"} onClose={onClose} wide>
      {job ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-2">
          Pre-filled from {job._customerContext ? "customer" : "job"} info — writes to office@leelectrical.us
        </p>
      ) : null}

      {showCalendar ? (
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
      <Fld label="Location" hint="Service address">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
      </Fld>
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

      <button type="button" className="btn-brand w-full" onClick={save} data-testid="appt-save">
        Save &amp; sync to calendar
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Syncs to office@leelectrical.us — appears on Today after sync.
      </p>
    </Sheet>
  );
}