// From a job: view/unlink/relink its calendar appointment.
import React, { useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import LinkJobSheet from "./LinkJobSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, eventForJob, unlinkAppointmentJob } from "../lib/calendarLink.js";

export default function AppointmentLinkSheet({ job, onClose }) {
  const { events, patchAndSave, enqueue, patchLocalEvent, showToast } = useStore();
  const [mode, setMode] = useState("view");
  const event = useMemo(() => eventForJob(job, events), [job, events]);

  const unlink = async () => {
    await unlinkAppointmentJob({
      event: event || { id: job.calEventId, description: "" },
      jobId: job.id,
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Appointment unlinked");
    onClose();
  };

  if (mode === "relink" && event) {
    return (
      <LinkJobSheet
        event={event}
        previousJobId={job.id}
        onClose={() => setMode("view")}
        onLinked={onClose}
      />
    );
  }

  return (
    <Sheet title="Calendar appointment" onClose={onClose}>
      {job.calEventId ? (
        <>
          {event ? (
            <div className="text-sm space-y-2 mb-4">
              <div>
                <b className="font-semibold">Appointment</b>{" "}
                <span className="text-slate-600">{event.summary || "—"}</span>
              </div>
              <div>
                <b className="font-semibold">When</b>{" "}
                <span className="text-slate-600">{evStart(event).replace("T", " ").slice(0, 16)}</span>
              </div>
              {displayEventNotes(event.description) ? (
                <p className="text-slate-600 whitespace-pre-wrap">{displayEventNotes(event.description)}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-4">
              Linked to calendar event <b>{job.calEventId}</b>. Pull calendar sync to see details here.
            </p>
          )}
          <button type="button" className="btn-ghost w-full mb-2 text-red-600" onClick={unlink}>
            Unlink appointment
          </button>
          <button type="button" className="btn bg-brand-soft text-brand w-full" onClick={() => setMode("relink")}>
            Link to a different job
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-500">No calendar appointment linked to this job yet.</p>
      )}
    </Sheet>
  );
}