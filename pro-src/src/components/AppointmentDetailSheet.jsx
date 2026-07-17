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
  contextualReminderActions,
  emailKindForAction,
  followUpCopy,
} from "../lib/appointmentActions.js";
import { clientKey } from "../lib/customers.js";
import { appointmentContactInfo } from "../lib/contactLinks.js";
import { TappableAddress, TappableEmail, TappablePhone } from "./TappableContact.jsx";

function linkedCustomerName(job) {
  return (job?.customer || job?.businessName || job?.title || "").trim() || "job";
}

export default function AppointmentDetailSheet({ event, onClose }) {
  const { jobs, events, setNewJob, patchJob, patchAndSave, patchLocalEvent, removeLocalEvent, enqueue, showToast } =
    useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState("view"); // view | edit | link | unlink | createJob | email | afterDuplicate
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

  const matchCandidates = useMemo(() => suggestJobsForEvent(liveEvent, jobs), [liveEvent, jobs]);
  const workJob = linked || matchCandidates[0] || null;
  const notes = displayEventNotes(liveEvent?.description);
  const prefill = useMemo(() => prefillFromEvent(liveEvent), [liveEvent]);
  const contact = useMemo(
    () => appointmentContactInfo(liveEvent, workJob, prefill),
    [liveEvent, workJob, prefill]
  );

  useEffect(() => {
    setUnlinkDone(false);
  }, [event?.id]);

  const goToCustomer = (job) => {
    if (!job) return;
    const key = clientKey(job);
    if (!key) return;
    onClose();
    nav("/customer/" + encodeURIComponent(key));
  };

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

  if (mode === "afterDuplicate") {
    const custName = workJob ? linkedCustomerName(workJob) : "";
    return (
      <Sheet title="Duplicate saved" onClose={onClose}>
        <div data-testid="after-duplicate-sheet">
        <p className="text-sm text-slate-600 mb-4">
          Copy is on the calendar. Where do you want to go?
        </p>
        <button
          type="button"
          className="btn-brand w-full mb-2"
          onClick={onClose}
          data-testid="after-dup-back"
        >
          Back to where I was
        </button>
        {workJob ? (
          <button
            type="button"
            className="btn bg-brand-soft text-brand w-full mb-2"
            onClick={() => goToCustomer(workJob)}
            data-testid="after-dup-customer"
          >
            Open customer — {custName}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => setMode("view")}
          data-testid="after-dup-stay"
        >
          Stay on this appointment
        </button>
        </div>
      </Sheet>
    );
  }

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
        onDuplicated={() => {
          // Save already queued + pulled; avoid a second pull that can flash extra local rows.
          setMode("afterDuplicate");
        }}
      />
    );
  }

  if (mode === "email" && workJob) {
    return (
      <AppointmentEmailSheet
        job={workJob}
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

  const scenario = classifyAppointment(workJob);
  const nextCopy = followUpCopy(scenario);
  const nextActions = contextualReminderActions(linked, {
    note: notes,
    candidates: matchCandidates,
  });

  const runNextAction = (action) => {
    if (action.key === "create_job") return setMode("createJob");
    if (action.key === "open_job" && workJob) {
      onClose();
      return nav("/job/" + encodeURIComponent(workJob.id));
    }
    if (action.key === "create_estimate" && workJob) {
      onClose();
      return nav("/job/" + encodeURIComponent(workJob.id) + "?doc=estimate&create=1");
    }
    if (action.key === "create_invoice" && workJob) {
      onClose();
      return nav("/job/" + encodeURIComponent(workJob.id) + "?doc=invoice&create=1");
    }
    if (action.key === "email_followup" || action.key === "email_invoice") {
      setEmailKind(emailKindForAction(action.key, scenario));
      return setMode("email");
    }
  };

  return (
    <Sheet title={liveEvent.summary || "Appointment"} onClose={onClose}>
      <div className="text-sm space-y-2 mb-4" data-testid="appt-contact-block">
        <div>
          <b className="font-semibold">When</b>{" "}
          <span className="text-slate-600">{evStart(liveEvent).replace("T", " ").slice(0, 16)}</span>
        </div>
        {contact.address ? (
          <div>
            <b className="font-semibold">Location</b>{" "}
            <TappableAddress address={contact.address} className="text-slate-600" />
          </div>
        ) : liveEvent.location ? (
          <div>
            <b className="font-semibold">Location</b>{" "}
            <TappableAddress address={liveEvent.location} className="text-slate-600" />
          </div>
        ) : null}
        {contact.phone ? (
          <div>
            <b className="font-semibold">Phone</b> <TappablePhone phone={contact.phone} className="text-slate-600" />
          </div>
        ) : null}
        {contact.email ? (
          <div>
            <b className="font-semibold">Email</b> <TappableEmail email={contact.email} className="text-slate-600" />
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
