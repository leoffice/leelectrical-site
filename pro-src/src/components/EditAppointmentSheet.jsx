// Edit, duplicate, or delete a calendar appointment (calendar_upsert / calendar_delete).
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import LocationSuggestField from "./LocationSuggestField.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, withJobLink } from "../lib/calendarLink.js";

function toLocalInput(start) {
  const s = (start || "").replace(" ", "T");
  if (!s) return "";
  if (s.length === 10) return s + "T09:00";
  return s.slice(0, 16);
}

export default function EditAppointmentSheet({ event, linkedJobId, onClose, onSaved, onDeleted, onDuplicated }) {
  const { jobs, events, enqueue, showToast, appendLocalEvent, pullCalendarNow } = useStore();
  const linkedJob = linkedJobId ? (jobs || []).find((j) => String(j.id) === String(linkedJobId)) : null;
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [summary, setSummary] = useState(event.summary || "");
  const [dt, setDt] = useState(toLocalInput(evStart(event)));
  const [location, setLocation] = useState(event.location || "");
  const [notes, setNotes] = useState(displayEventNotes(event.description) || "");

  const eventId = duplicating ? "" : event.id || "";
  const busJobId = linkedJobId || "today";

  const save = async () => {
    const title = (summary || "").trim();
    if (!title) return showToast("Add a title for the appointment");
    if (!dt) return showToast("Pick date and time");
    const description = linkedJobId ? withJobLink(notes, linkedJobId) : notes;
    const key = (duplicating ? "caldup:" : "caledit:") + (eventId || dt) + ":" + title.slice(0, 24);
    await enqueue(
      "calendar_upsert",
      busJobId,
      {
        calEventId: eventId,
        summary: title,
        start: dt,
        location: location || "",
        description: description || "Updated in LE Pro",
      },
      "judgment",
      key
    );
    const patch = {
      id: eventId || "pending-" + Date.now(),
      summary: title,
      start: dt,
      location: location || "",
      description,
    };
    appendLocalEvent({ ...event, ...patch });
    pullCalendarNow();
    if (duplicating) {
      showToast("Duplicate queued — syncing to calendar");
      onDuplicated && onDuplicated(patch);
    } else {
      showToast("Appointment updated — syncing to calendar");
      onSaved && onSaved({ ...event, ...patch });
    }
    onClose();
  };

  const remove = async () => {
    if (!event.id) return onClose();
    await enqueue(
      "calendar_delete",
      busJobId,
      { calEventId: event.id },
      "judgment",
      "caldel:" + event.id
    );
    showToast("Appointment delete queued");
    onDeleted && onDeleted(event.id);
    onClose();
  };

  if (confirmDel) {
    return (
      <Sheet title="Delete appointment?" onClose={() => setConfirmDel(false)}>
        <p className="text-sm text-slate-500 mb-4">
          Removes it from Google Calendar. The linked job on the dashboard is kept; only the calendar link is cleared.
        </p>
        <button className="btn bg-red-100 text-red-600 w-full" onClick={remove}>
          Delete appointment
        </button>
        <button className="btn-ghost w-full mt-2" onClick={() => setConfirmDel(false)}>
          Cancel
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title={duplicating ? "Duplicate appointment" : "Edit appointment"} onClose={onClose}>
      {linkedJobId && (
        <p className="text-[11px] text-slate-400 -mt-1 mb-3">
          {duplicating ? "New copy will stay linked to the same job." : "Linked to job " + linkedJobId + "."}
        </p>
      )}
      <Fld label="Title">
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
      {linkedJob ? (
        <LocationSuggestField
          job={linkedJob}
          jobs={jobs}
          events={events}
          value={location}
          onChange={setLocation}
        />
      ) : (
        <Fld label="Location">
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
        </Fld>
      )}
      <Fld label="Notes">
        <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
      </Fld>
      <button className="btn-brand w-full" onClick={save}>
        {duplicating ? "Create duplicate" : "Save changes"}
      </button>
      {!duplicating && event.id ? (
        <>
          <button
            className="btn bg-brand-soft text-brand w-full mt-2"
            onClick={() => {
              setDuplicating(true);
              showToast("Adjust date/time, then save to create the copy");
            }}
          >
            Duplicate (same job link)
          </button>
          <button className="btn-ghost w-full mt-2 text-red-600" onClick={() => setConfirmDel(true)}>
            Delete appointment
          </button>
        </>
      ) : null}
    </Sheet>
  );
}