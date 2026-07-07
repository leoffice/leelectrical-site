// Searchable calendar picker — link an existing appointment to a job (YTD).
import React, { useMemo, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import {
  applyAppointmentJobLink,
  displayEventNotes,
  linkedJobForEvent,
  searchCalendarEvents,
} from "../lib/calendarLink.js";

function formatWhen(event) {
  const s = evStart(event).replace("T", " ");
  return s.slice(0, 16) || "—";
}

export default function PickAppointmentSheet({ job, onClose, onLinked }) {
  const { events, jobs, patchAndSave, enqueue, patchLocalEvent, showToast } = useStore();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);

  const matches = useMemo(() => searchCalendarEvents(events, query), [events, query]);

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
    return (
      <Sheet title="Confirm link" onClose={() => setPicked(null)}>
        <p className="text-sm text-slate-500 mb-3">Link this appointment to {job.customer || "this job"}?</p>
        <div className="card px-4 py-3 mb-4 text-sm space-y-1">
          <div className="font-bold text-slate-900">{picked.summary || "Appointment"}</div>
          <div className="text-slate-500">{formatWhen(picked)}</div>
          {picked.location ? <div className="text-slate-600">{picked.location}</div> : null}
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
        Appointments since Jan 1 — search by address, customer, or notes.
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
      {matches.length ? (
        <div className="space-y-0">
          {matches.map((e) => {
            const linked = linkedJobForEvent(e, jobs);
            const note = [
              formatWhen(e),
              e.location || "",
              linked && linked.id !== job.id ? "Linked to " + (linked.customer || linked.title) : "",
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Opt
                key={e.id || evStart(e) + e.summary}
                icon="📅"
                title={e.summary || "Appointment"}
                note={note}
                onClick={() => setPicked(e)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-8">
          {query ? "No appointments match your search." : "No appointments this year yet — sync calendar first."}
        </div>
      )}
    </Sheet>
  );
}