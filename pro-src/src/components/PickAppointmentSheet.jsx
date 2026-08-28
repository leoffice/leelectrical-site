// Searchable calendar picker — link an existing appointment to a job (all synced events).
// Paged + O(1) link lookup per row (freeze fix, Levi 2026-08-28).
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { CAL_SEARCH_PAGE } from "./CalendarSearchSheet.jsx";

function formatWhen(event) {
  const s = evStart(event).replace("T", " ");
  return s.slice(0, 16) || "—";
}

/** One Map of calEventId → job so each row is O(1), not O(jobs). */
function buildCalLinkIndex(jobs) {
  const byId = new Map();
  for (const j of jobs || []) {
    if (j._archived || j._deleted) continue;
    const eid = j.calEventId;
    if (eid) byId.set(String(eid), j);
  }
  return byId;
}

function eventNoteLine(event, linkIndex, job) {
  const linked = event?.id ? linkIndex.get(String(event.id)) : null;
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
  const [limit, setLimit] = useState(CAL_SEARCH_PAGE);
  const [picked, setPicked] = useState(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    refresh?.({ pullCalendar: true, awaitPull: false }).catch(() => {});
  }, [refresh]);

  const linkIndex = useMemo(() => buildCalLinkIndex(jobs), [jobs]);
  const suggestions = useMemo(() => suggestAppointmentsForJob(job, events), [job, events]);
  const matches = useMemo(
    () => searchCalendarEvents(events, deferredQuery),
    [events, deferredQuery]
  );
  const visible = matches.slice(0, limit);
  const hasMore = matches.length > limit;

  const onQueryChange = (e) => {
    setQuery(e.target.value);
    setLimit(CAL_SEARCH_PAGE);
  };

  const renderEvent = (e) => (
    <Opt
      key={e.id || evStart(e) + e.summary}
      icon="📅"
      title={e.summary || "Appointment"}
      note={eventNoteLine(e, linkIndex, job)}
      onClick={() => setPicked(e)}
    />
  );

  const confirmLink = async () => {
    if (!picked) return;
    // SNAPPY: close first — enqueue/network must not freeze the sheet (lag list).
    const event = picked;
    showToast("Linked to " + (event.summary || "appointment"));
    onLinked && onLinked(event);
    onClose();
    void applyAppointmentJobLink({
      event,
      job,
      jobs,
      previousJobId: job.calEventId ? job.id : "",
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
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
        Appointments this year through next year — search by address, customer, calendar notes, or date.
      </p>
      <input
        className="input mb-3"
        placeholder="Search address, name, notes…"
        value={query}
        onChange={onQueryChange}
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
        <div className="space-y-0" data-testid="pick-appt-results">
          {query.trim() ? (
            <div className="text-xs font-bold text-slate-500 mb-1.5 px-0.5">Search results</div>
          ) : (
            <div className="text-xs font-bold text-slate-500 mb-1.5 px-0.5">All appointments</div>
          )}
          {visible.map(renderEvent)}
          {hasMore ? (
            <button
              type="button"
              className="btn-ghost w-full mt-2"
              data-testid="pick-appt-load-more"
              onClick={() => setLimit((n) => n + CAL_SEARCH_PAGE)}
            >
              Load more ({matches.length - limit} more)
            </button>
          ) : null}
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
