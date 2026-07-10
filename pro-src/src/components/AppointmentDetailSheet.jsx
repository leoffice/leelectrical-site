// Appointment detail: view info, edit, job link, or create job.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet from "./Sheet.jsx";
import EditAppointmentSheet from "./EditAppointmentSheet.jsx";
import LinkJobSheet from "./LinkJobSheet.jsx";
import { prefillFromEvent } from "../lib/prefillFromEvent.js";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, linkedJobForEvent, suggestJobsForEvent, unlinkAppointmentJob } from "../lib/calendarLink.js";
import CreateJobFromEventSheet from "./CreateJobFromEventSheet.jsx";
import AppointmentEmailSheet from "./AppointmentEmailSheet.jsx";
import {
  classifyAppointment,
  emailKindForAction,
  followUpActions,
  followUpCopy,
} from "../lib/appointmentActions.js";

function linkedCustomerName(job) {
  return (job?.customer || job?.businessName || job?.title || "").trim() || "job";
}

export default function AppointmentDetailSheet({ event, onClose }) {
  const { jobs, events, setNewJob, patchJob, patchAndSave, patchLocalEvent, removeLocalEvent, enqueue, showToast } =
    useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState("view"); // view | edit | link | unlink | createJob | email
  const [emailKind, setEmailKind] = useState("estimate");
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
        job: linked,
        jobId,
        patchJob,
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
              job: linked,
              jobId: linked.id,
              patchJob,
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

  if (mode === "email" && linked) {
    return (
      <AppointmentEmailSheet
        job={linked}
        emailKind={emailKind}
        title={emailKind === "invoice" ? "Payment reminder email" : "Estimate follow-up email"}
        onClose={() => setMode("view")}
      />
    );
  }

  if (mode === "createJob") {
    return (
      <CreateJobFromEventSheet
        event={liveEvent}
        suggestions={suggestJobsForEvent(liveEvent, jobs)}
        onClose={() => setMode("view")}
        onLinked={() => onClose()}
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
  const scenario = classifyAppointment(linked);
  const nextCopy = followUpCopy(scenario);
  const nextActions = followUpActions(scenario).filter((a) => a.key !== "remind");

  const runNextAction = (action) => {
    if (action.key === "create_job") return setMode("createJob");
    if (action.key === "open_job" && linked) {
      onClose();
      return nav("/job/" + encodeURIComponent(linked.id));
    }
    if (action.key === "create_estimate" && linked) {
      onClose();
      return nav("/job/" + encodeURIComponent(linked.id) + "?doc=estimate&create=1");
    }
    if (action.key === "create_invoice" && linked) {
      onClose();
      return nav("/job/" + encodeURIComponent(linked.id) + "?doc=invoice&create=1");
    }
    if (action.key === "email_followup" || action.key === "email_invoice") {
      setEmailKind(emailKindForAction(action.key, scenario));
      return setMode("email");
    }
  };

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

      {nextActions.length ? (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/40 px-3 py-3 mb-4">
          <div className="text-xs font-bold text-brand uppercase tracking-wide mb-1">{nextCopy.title}</div>
          <p className="text-sm text-slate-600 mb-2">{nextCopy.lead}</p>
          <div className="space-y-2">
            {nextActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={(action.primary ? "btn-brand" : "btn bg-white text-slate-800") + " w-full !py-2 text-sm"}
                onClick={() => runNextAction(action)}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={() => setMode("edit")}>
        ✏️ Edit appointment
      </button>

      <button
        type="button"
        className="btn-brand w-full mb-2"
        onClick={() => {
          if (linked) {
            onClose();
            nav("/job/" + encodeURIComponent(linked.id));
          } else {
            setMode("createJob");
          }
        }}
        data-testid="appt-open-job"
      >
        {linked ? "Open the job — " + linkedCustomerName(linked) : "Create a job"}
      </button>

      {linked ? (
        <button type="button" className="btn-ghost w-full mb-2 text-red-600" onClick={() => setMode("unlink")}>
          Unlink
        </button>
      ) : (
        <button type="button" className="btn bg-brand-soft text-brand w-full mb-2" onClick={() => setMode("link")}>
          🔗 Link to existing job
        </button>
      )}

      <button
        type="button"
        className="btn bg-slate-100 text-slate-800 w-full mb-2"
        onClick={() => {
          onClose();
          setNewJob({ step: "form", prefill: prefillFromEvent(liveEvent) });
        }}
      >
        ＋ Create job from appointment (skip suggestions)
      </button>
      <button
        type="button"
        className="btn bg-slate-100 text-slate-800 w-full"
        onClick={() => {
          onClose();
          setNewJob({ step: "newCustomer", prefill: prefillFromEvent(liveEvent) });
        }}
      >
        ＋ Create customer from appointment
      </button>
    </Sheet>
  );
}