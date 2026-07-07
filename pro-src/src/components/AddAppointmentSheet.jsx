// Queue a new Google Calendar appointment (calendar_upsert on the command bus).
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { withJobLink } from "../lib/calendarLink.js";

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
  if (defaultDate) return defaultDate + "T09:00";
  const d = job?.status?.Scheduled?.d || job?.followUp?.date || "";
  return d ? d + "T09:00" : "";
}

export default function AddAppointmentSheet({ defaultDate, job, onClose }) {
  const { enqueue, showToast, patchAndSave, appendLocalEvent, pullCalendarNow } = useStore();
  const [summary, setSummary] = useState(() => jobDefaultSummary(job));
  const [dt, setDt] = useState(() => jobDefaultDate(job, defaultDate));
  const [location, setLocation] = useState(() => (job ? effectiveServiceAddress(job) : ""));
  const [notes, setNotes] = useState(() => jobDefaultNotes(job));

  const save = async () => {
    const title = (summary || "").trim();
    if (!title) return showToast("Add a title for the appointment");
    if (!dt) return showToast("Pick date and time");
    const busId = job?.id || "today";
    const description = job ? withJobLink(notes || "Created in LE Pro", job.id) : notes || "Created in LE Pro";
    const key = (job ? "jobcal:" + job.id : "todaycal:") + ":" + dt + ":" + title.slice(0, 24);
    await enqueue(
      "calendar_upsert",
      busId,
      {
        calEventId: job?.calEventId || "",
        summary: title,
        start: dt,
        location: location || "",
        description,
      },
      "judgment",
      key
    );
    if (job) {
      const day = dt.slice(0, 10);
      await patchAndSave(job.id, {
        status: { Scheduled: { s: "done", d: day } },
      });
    }
    appendLocalEvent({
      id: "pending-" + Date.now(),
      summary: title,
      start: dt,
      location: location || "",
      description,
    });
    pullCalendarNow();
    showToast(job ? "Appointment queued & linked to job" : "Appointment queued — syncs to Google Calendar");
    onClose();
  };

  return (
    <Sheet title={job ? "Create appointment for job" : "Add appointment"} onClose={onClose}>
      {job ? (
        <p className="text-[11px] text-slate-400 -mt-1 mb-3">
          Writes to office@leelectrical.us and links to {job.customer || "this job"}.
        </p>
      ) : null}
      <Fld label="Title" hint="What shows on the calendar">
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Appointment title" />
      </Fld>
      <Fld label="Date & time">
        <input
          className="input"
          type="datetime-local"
          value={dt}
          onChange={(e) => setDt(e.target.value)}
          aria-label="Appointment date and time"
        />
      </Fld>
      <Fld label="Location" hint="Service address (optional)">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
      </Fld>
      <Fld label="Notes" hint="Phone, customer name, details (optional)">
        <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
      </Fld>
      <button className="btn-brand w-full" onClick={save}>
        {job ? "Save & sync to calendar" : "Add to calendar"}
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Syncs to office@leelectrical.us — appears on Today after sync (auto-refreshes).
      </p>
    </Sheet>
  );
}