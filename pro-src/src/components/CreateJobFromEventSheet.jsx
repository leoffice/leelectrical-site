// No job on calendar event — suggest a match or create fresh from appointment.
import React, { useMemo } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { prefillFromEvent } from "../lib/prefillFromEvent.js";
import { applyAppointmentJobLink } from "../lib/calendarLink.js";
import { suggestJobsForEvent } from "../lib/calendarLink.js";
import { fmtAmountDue } from "../lib/customers.js";
import { evStart } from "../lib/format.js";

export default function CreateJobFromEventSheet({ event, suggestions: propSuggestions, onClose, onLinked, onCreateNew }) {
  const { jobs, setNewJob, patchAndSave, enqueue, patchLocalEvent, showToast } = useStore();
  const suggestions = useMemo(
    () => propSuggestions || suggestJobsForEvent(event, jobs),
    [propSuggestions, event, jobs]
  );
  const top = suggestions[0];

  const linkTo = async (job) => {
    await applyAppointmentJobLink({
      event,
      job,
      jobs,
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Linked to " + (job.customer || "job"));
    onLinked && onLinked(job);
    onClose();
  };

  const createNew = () => {
    onClose();
    if (onCreateNew) {
      onCreateNew();
      return;
    }
    setNewJob({ step: "form", prefill: prefillFromEvent(event) });
  };

  if (top) {
    return (
      <Sheet title="Create a job?" onClose={onClose}>
        <p className="text-sm text-slate-500 mb-3">
          No job is linked to this appointment yet. This looks like it might already be on:
        </p>
        <div className="card px-4 py-3 mb-4 border-brand/30 bg-brand-soft/20">
          <div className="font-bold text-slate-900">{top.customer || top.businessName}</div>
          <div className="text-sm text-slate-500 mt-0.5">{top.title || "Untitled job"}</div>
          {fmtAmountDue(top) ? (
            <div className="text-sm font-semibold text-slate-700 mt-1">{fmtAmountDue(top)}</div>
          ) : null}
        </div>
        <button type="button" className="btn-brand w-full mb-2" onClick={() => linkTo(top)} data-testid="confirm-link-job">
          Yes — link to this job
        </button>
        {suggestions.length > 1 ? (
          <div className="mb-3 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Other matches</p>
            {suggestions.slice(1).map((j) => (
              <Opt
                key={j.id}
                icon="🗂️"
                title={j.customer || j.title}
                note={j.title && j.customer ? j.title : fmtAmountDue(j) || j.id}
                onClick={() => linkTo(j)}
              />
            ))}
          </div>
        ) : null}
        <button type="button" className="btn-ghost w-full" onClick={createNew} data-testid="create-new-job-instead">
          Something else — create new job from calendar
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Create a job?" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        No job is linked to <b className="text-slate-800">{event?.summary || "this appointment"}</b> (
        {evStart(event).replace("T", " ").slice(0, 16)}). Create one with the calendar details filled in?
      </p>
      <button type="button" className="btn-brand w-full mb-2" onClick={createNew} data-testid="create-job-from-event">
        ＋ Create job from appointment
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onClose}>
        Not now
      </button>
    </Sheet>
  );
}