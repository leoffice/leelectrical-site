// Appointment detail: view info, edit, job link, or create job.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet from "./Sheet.jsx";
import EditAppointmentSheet from "./EditAppointmentSheet.jsx";
import LinkJobSheet from "./LinkJobSheet.jsx";
import { prefillFromEvent } from "./NewJobFlow.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, linkedJobForEvent, unlinkAppointmentJob } from "../lib/calendarLink.js";

function linkedCustomerName(job) {
  return (job?.customer || job?.businessName || job?.title || "").trim() || "job";
}

export default function AppointmentDetailSheet({ event, onClose }) {
  const { jobs, events, setNewJob, patchAndSave, patchLocalEvent, removeLocalEvent, enqueue, showToast } =
    useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState("view");
  const [unlinkDone, setUnlinkDone] = useState(false);
  const liveEvent = useMemo(
    () => (events || []).find((e) => String(e.id) === String(event?.id)) || event,
    [events, event]
  );
  const linked = useMemo(() => {
    if (unlinkDone) return null;
    return linkedJobForEvent(liveEvent, jobs);
  }, [liveEvent, jobs, unlinkDone]);

  useEffect(() => {
    setUnlinkDone(false);
  }, [event?.id]);

  const confirmUnlink = async () => {
    if (!linked) return;
    const name = linkedCustomerName(linked);
    const jobId = linked.id;
    const eid = liveEvent?.id || "";
    // Close confirm + drop linked buttons immediately; sync in background.
    setUnlinkDone(true);
    setMode("view");
    if (eid) patchLocalEvent(eid, { description: displayEventNotes(liveEvent.description) });
    try {
      await unlinkAppointmentJob({
        event: liveEvent,
        jobId,
        patchAndSave,
        enqueue,
        patchLocalEvent,
      });
      showToast("Unlinked from " + name);
    } catch {
      setUnlinkDone(false);
      showToast("Unlink failed — try again");
    }
  };

  if (mode === "edit") {
    return (
      <EditAppointmentSheet
        event={liveEvent}
        linkedJobId={linked?.id}
        onClose={() => setMode("view")}
        onSaved={(ev) => patchLocalEvent(ev.id, ev)}
        onDeleted={async (eid) => {
          if (linked?.id) {
            await unlinkAppointmentJob({
              event: liveEvent,
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
        event={liveEvent}
        previousJobId={linked?.id}
        onClose={() => setMode("view")}
        onLinked={() => onClose()}
      />
    );
  }

  if (mode === "unlink") {
    const name = linked ? linkedCustomerName(linked) : "this job";
    return (
      <Sheet title="Unlink appointment" onClose={() => setMode("view")}>
        <p className="text-sm text-slate-500 mb-4">
          Remove the link between this appointment and <b className="text-slate-800">{name}</b>? The appointment
          stays on the calendar.
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

  const notes = displayEventNotes(liveEvent.description);

  return (
    <Sheet title={liveEvent.summary || "Appointment"} onClose={onClose}>
      <div className="text-sm space-y-2 mb-4">
        <div>
          <b className="font-semibold">When</b>{" "}
          <span className="text-slate-600">{evStart(liveEvent).replace("T", " ").slice(0, 16)}</span>
        </div>
        {liveEvent.location ? (
          <div>
            <b className="font-semibold">Location</b> <span className="text-slate-600">{liveEvent.location}</span>
          </div>
        ) : null}
        {notes ? (
          <div>
            <b className="font-semibold">Notes</b>
            <p className="text-slate-600 whitespace-pre-wrap mt-1">{notes}</p>
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
            🔗 {linkedCustomerName(linked)}
          </button>
          <button type="button" className="btn-ghost w-full mb-2 text-red-600" onClick={() => setMode("unlink")}>
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
          setNewJob({ step: "form", prefill: prefillFromEvent(liveEvent) });
        }}
      >
        ＋ Create job from appointment
      </button>
    </Sheet>
  );
}