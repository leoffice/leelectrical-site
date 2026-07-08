// From a job: view/unlink/relink its calendar appointment.
import React, { useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import LinkJobSheet from "./LinkJobSheet.jsx";
import PickAppointmentSheet from "./PickAppointmentSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, eventForJob, unlinkAppointmentJob } from "../lib/calendarLink.js";

export default function AppointmentLinkSheet({ job, onClose }) {
  const { events, patchJob, patchAndSave, enqueue, patchLocalEvent, showToast } = useStore();
  const [mode, setMode] = useState("view");
  const event = useMemo(() => eventForJob(job, events), [job, events]);
  const customerName = (job?.customer || job?.businessName || job?.title || "this job").trim();

  const confirmUnlink = async () => {
    await unlinkAppointmentJob({
      event: event || { id: job.calEventId, description: "" },
      job,
      jobId: job.id,
      patchJob,
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Appointment unlinked");
    onClose();
  };

  if (mode === "add") {
    return <AddAppointmentSheet job={job} onClose={onClose} />;
  }

  if (mode === "pick") {
    return <PickAppointmentSheet job={job} onClose={onClose} onLinked={onClose} />;
  }

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

  if (mode === "unlink") {
    return (
      <Sheet title="Unlink appointment" onClose={() => setMode("view")}>
        <p className="text-sm text-slate-500 mb-4">
          Remove the calendar link from <b className="text-slate-800">{customerName}</b>? The appointment stays on
          the calendar.
        </p>
        <button type="button" className="btn-brand w-full" onClick={confirmUnlink}>
          Save &amp; sync
        </button>
        <button type="button" className="btn-ghost w-full mt-2" onClick={() => setMode("view")}>
          Cancel
        </button>
      </Sheet>
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
          <button type="button" className="btn-ghost w-full mb-2 text-red-600" onClick={() => setMode("unlink")}>
            Unlink appointment
          </button>
          <button type="button" className="btn bg-brand-soft text-brand w-full" onClick={() => setMode("relink")}>
            Link to a different job
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-red-600 font-semibold mb-2">No linked appointment</p>
          <p className="text-sm text-slate-500 mb-4">
            Link an existing calendar appointment (searchable, since Jan 1) or create a new one.
          </p>
          <button type="button" className="btn-brand w-full mb-2" onClick={() => setMode("pick")}>
            📅 Link from calendar
          </button>
          <button type="button" className="btn bg-brand-soft text-brand w-full" onClick={() => setMode("add")}>
            ＋ Create appointment
          </button>
        </>
      )}
    </Sheet>
  );
}