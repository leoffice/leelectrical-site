// Searchable calendar picker — link an existing appointment to a job (all synced events).
import React, { useEffect, useMemo, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import {
  applyAppointmentJobLink,
  appointmentSearchSeed,
  displayEventNotes,
  linkedJobForEvent,
  searchCalendarEvents,
  suggestAppointmentsForJob,
} from "../lib/calendarLink.js";

function formatWhen(event) {
  const s = evStart(event).replace("T", " ");
  return s.slice(0, 16) || "—";
}

function eventNoteLine(event, jobs, job) {
  const linked = linkedJobForEvent(event, jobs);
  const notes = displayEventNotes(event.description);
  return [
    formatWhen(event),
    event.location || "",
    notes ? notes.slice(0, 72) : "",
    linked && linked.id !== job.id ? "Linked to " + (linked.customer || linked.title) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function PickAppointmentSheet({ job, onClose, onLinked }) {
  const { events, jobs, patchAndSave, enqueue, patchLocalEvent, showToast, refresh } = useStore();
  const [query, setQuery] = useState(() => appointmentSearchSeed(job));
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    refresh?.({ pullCalendar: true, awaitPull: false }).catch(() => {});
  }, [refresh]);

  const suggestions = useMemo(() => suggestAppointmentsForJob(job, events), [job, events]);
  const matches = useMemo(() => searchCalendarEvents(events, query), [events, query]);

  const renderEvent = (e) => (
    <Opt
      key={e.id || evStart(e) + e.summary}
      icon="📅"
      title={e.summary || "Appointment"}
      note={eventNoteLine(e, jobs, job)}
      onClick={() => setPicked(e)}
    />
  );

  const confirmLink = async () => {
    if (!picked) return;
    await applyAppointmentJobLink({
      event: picked,
      job,
      jobs,
      previousJobId: job.calEventId ? job.id : "",
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Linked to " + (picked.summary || "appointment"));
    onLinked && onLinked(picked);
    onClose();
  };

  if (picked) {
    const other = linkedJobForEvent(picked, jobs);
    const notes = displayEventNotes(picked.description);
    return (
      <Sheet title="Confirm link" onClose={() => setPicked(null)}>
        <p className="text-sm text-slate-500 mb-3">Link this appointment to {job.customer || "this job"}?</p>
        <div className="card px-4 py-3 mb-4 text-sm space-y-1">
          <div className="font-bold text-slate-900">{picked.summary || "Appointment"}</div>
          <div className="text-slate-500">{formatWhen(picked)}</div>
          {picked.location ? <div className="text-slate-600">{picked.location}</div> : null}
          {notes ? <div className="text-slate-600 text-xs whitespace-pre-wrap">{notes}</div> : null}
          {other && other.id !== job.id ? (
            <p className="text-amber-700 text-xs mt-2">
              Currently linked to <b>{other.customer || other.title}</b> — will be unlinked.
            </p>
          ) : null}
        </div>
        <button type="button" className="btn-brand w-full" onClick={confirmLink}>
          Save &amp; sync
        </button>
        <button type="button" className="btn-ghost w-full mt-2" onClick={() => setPicked(null)}>
          Back
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Link from calendar" onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3">
        All synced appointments — search by address, customer, calendar notes, or date.
      </p>
      <input
        className="input mb-3"
        placeholder="Search address, name, notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search calendar appointments"
        data-testid="pick-appt-search"
        autoFocus
      />
      {!query.trim() && suggestions.length > 0 && (
        <div className="mb-4" data-testid="suggested-appointments">
          <div className="text-xs font-bold text-slate-500 mb-1.5 px-0.5">Suggested appointments</div>
          <div className="space-y-0">{suggestions.map(renderEvent)}</div>
        </div>
      )}

      {matches.length ? (
        <div className="space-y-0">
          {query.trim() ? (
            <div className="text-xs font-bold text-slate-500 mb-1.5 px-0.5">Search results</div>
          ) : (
            <div className="text-xs font-bold text-slate-500 mb-1.5 px-0.5">All appointments</div>
          )}
          {matches.map(renderEvent)}
        </div>
      ) : query.trim() ? (
        <div className="text-sm text-slate-400 text-center py-8">No appointments match your search.</div>
      ) : !suggestions.length ? (
        <div className="text-sm text-slate-400 text-center py-8">
          No calendar events yet — tap Sync on the jobs screen, then try again.
        </div>
      ) : null}
    </Sheet>
  );
}