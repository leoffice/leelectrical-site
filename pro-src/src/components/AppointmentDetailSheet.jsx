// Appointment detail: view info, edit, job link, or create job.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet from "./Sheet.jsx";
import EditAppointmentSheet from "./EditAppointmentSheet.jsx";
import LinkJobSheet from "./LinkJobSheet.jsx";
import { prefillFromEvent } from "./NewJobFlow.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, linkedJobForEvent, unlinkAppointmentJob } from "../lib/calendarLink.js";

export default function AppointmentDetailSheet({ event, onClose }) {
  const { jobs, setNewJob, patchAndSave, patchLocalEvent, removeLocalEvent, enqueue, showToast } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState("view");
  const linked = useMemo(() => linkedJobForEvent(event, jobs), [event, jobs]);

  const unlink = async () => {
    if (!linked) return;
    await unlinkAppointmentJob({
      event,
      jobId: linked.id,
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Unlinked from " + (linked.customer || "job"));
  };

  if (mode === "edit") {
    return (
      <EditAppointmentSheet
        event={event}
        linkedJobId={linked?.id}
        onClose={() => setMode("view")}
        onSaved={(ev) => patchLocalEvent(ev.id, ev)}
        onDeleted={async (eid) => {
          if (linked?.id) {
            await unlinkAppointmentJob({
              event,
              jobId: linked.id,
              patchAndSave,
              enqueue,
              patchLocalEvent,
            });
          }
          removeLocalEvent(eid);
          onClose();
        }}
        onDuplicated={() => {}}
      />
    );
  }

  if (mode === "link") {
    return (
      <LinkJobSheet
        event={event}
        previousJobId={linked?.id}
        onClose={() => setMode("view")}
        onLinked={() => onClose()}
      />
    );
  }

  const notes = displayEventNotes(event.description);

  return (
    <Sheet title={event.summary || "Appointment"} onClose={onClose}>
      <div className="text-sm space-y-2 mb-4">
        <div>
          <b className="font-semibold">When</b>{" "}
          <span className="text-slate-600">{evStart(event).replace("T", " ").slice(0, 16)}</span>
        </div>
        {event.location ? (
          <div>
            <b className="font-semibold">Location</b> <span className="text-slate-600">{event.location}</span>
          </div>
        ) : null}
        {notes ? (
          <div>
            <b className="font-semibold">Notes</b>
            <p className="text-slate-600 whitespace-pre-wrap mt-1">{notes}</p>
          </div>
        ) : null}
        {linked ? (
          <div className="text-xs font-semibold text-brand pt-1">
            Linked job: {linked.customer || linked.title || linked.id}
          </div>
        ) : null}
      </div>

      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={() => setMode("edit")}>
        ✏️ Edit appointment
      </button>

      {linked ? (
        <>
          <button
            type="button"
            className="btn bg-brand-soft text-brand w-full mb-2"
            onClick={() => {
              onClose();
              nav("/job/" + encodeURIComponent(linked.id));
            }}
          >
            Open linked job
          </button>
          <button type="button" className="btn-ghost w-full mb-2 text-red-600" onClick={unlink}>
            Unlink
          </button>
        </>
      ) : (
        <button type="button" className="btn bg-brand-soft text-brand w-full mb-2" onClick={() => setMode("link")}>
          🔗 Link to existing job
        </button>
      )}

      <button
        type="button"
        className="btn-brand w-full"
        onClick={() => {
          onClose();
          setNewJob({ step: "form", prefill: prefillFromEvent(event) });
        }}
      >
        ＋ Create job from appointment
      </button>
    </Sheet>
  );
}