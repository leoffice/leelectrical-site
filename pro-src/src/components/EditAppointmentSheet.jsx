// Edit, duplicate, or delete a calendar appointment (calendar_upsert / calendar_delete).
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes } from "../lib/calendarLink.js";

function toLocalInput(start) {
  const s = (start || "").replace(" ", "T");
  if (!s) return "";
  if (s.length === 10) return s + "T09:00";
  return s.slice(0, 16);
}

export default function EditAppointmentSheet({
  event,
  linkedJobId,
  inspectionPreset,
  onClose,
  onSaved,
  onDeleted,
  onDuplicated,
  /** In-page under calendar (no nested week grid / no modal). */
  inline = false,
  showCalendar,
}) {
  const embedCal = showCalendar != null ? showCalendar : !inline;
  const { jobs, enqueue, showToast } = useStore();
  const linkedJob = linkedJobId ? (jobs || []).find((j) => String(j.id) === String(linkedJobId)) : null;
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const busJobId = linkedJobId || "today";

  const remove = async () => {
    if (!event.id) return onClose();
    await enqueue("calendar_delete", busJobId, { calEventId: event.id }, "judgment", "caldel:" + event.id);
    showToast("Appointment delete queued");
    onDeleted && onDeleted(event.id);
    onClose();
  };

  if (duplicating) {
    return (
      <AddAppointmentSheet
        job={linkedJob}
        duplicateFrom={event}
        defaultDate={toLocalInput(evStart(event))}
        defaultSummary={event.summary}
        defaultLocation={event.location}
        defaultNotes={displayEventNotes(event.description)}
        showCalendar={embedCal}
        inline={inline}
        onClose={() => setDuplicating(false)}
        onSaved={() => {
          // Parent owns post-save navigation (back vs customer chooser).
          if (onDuplicated) {
            onDuplicated();
            return;
          }
          onClose();
        }}
      />
    );
  }

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
    <AddAppointmentSheet
      editEvent={event}
      job={linkedJob}
      inspectionPreset={inspectionPreset}
      showCalendar={embedCal}
      inline={inline}
      onClose={onClose}
      onSaved={onSaved}
      onDelete={event.id ? () => setConfirmDel(true) : undefined}
      onDuplicate={
        event.id
          ? () => {
              setDuplicating(true);
              showToast("Pick a new date/time, set reminders or invite, then save");
            }
          : undefined
      }
    />
  );
}