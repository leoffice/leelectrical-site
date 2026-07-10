// Login follow-up popups — service calls, must-today loop, inspections.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import CreateJobFromEventSheet from "./CreateJobFromEventSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { todayStr } from "../lib/format.js";
import { linkedJobForEvent } from "../lib/calendarLink.js";
import { displayEventNotes } from "../lib/calendarLink.js";
import {
  REMINDER_PRIORITIES,
  buildPromptQueue,
  defaultRemindDatetime,
  patchEventState,
  pickFirmerNudge,
  scheduleNextBusinessDayReminder,
  scheduleSameDayPushOff,
  validateRemindDatetime,
} from "../lib/followUpReminders.js";
import {
  classifyAppointment,
  emailKindForAction,
  followUpActions,
  followUpCopy,
} from "../lib/appointmentActions.js";
import AppointmentEmailSheet from "./AppointmentEmailSheet.jsx";

const SESSION_KEY = "lepro_followup_session";
const IS_TEST = import.meta.env.MODE === "test" || !!import.meta.env.VITEST;

function markSessionPrompted() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function sessionAlreadyPrompted() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function RemindMeSheet({ event, job, onClose, onSaved }) {
  const { patchAndSave, showToast } = useStore();
  const [dt, setDt] = useState(() => defaultRemindDatetime());
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("medium");

  const save = async () => {
    const err = validateRemindDatetime(dt);
    if (err) {
      showToast(err);
      return;
    }
    patchEventState(event.id, {
      remindAt: dt,
      note,
      priority,
      pushOffCount: 0,
      nextNudgeAt: "",
    });
    if (job?.id) {
      await patchAndSave(job.id, {
        followUp: {
          type: "Follow-up",
          text: note || event.summary || "Follow up",
          date: dt.slice(0, 10),
          remind: true,
          priority,
        },
      });
    }
    showToast(
      priority === "must_today"
        ? "Must-do-today reminder set — I'll keep nudging you today"
        : "Reminder set for " + dt.replace("T", " ").slice(0, 16)
    );
    onSaved && onSaved();
    onClose();
  };

  return (
    <Sheet title="Remind me" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Weekdays · 9 AM – 5 PM · {event?.summary || "Appointment"}
      </p>
      <Fld label="When">
        <input
          className="input"
          type="datetime-local"
          value={dt}
          min={defaultRemindDatetime().slice(0, 10) + "T09:00"}
          max="2099-12-31T16:59"
          onChange={(e) => setDt(e.target.value)}
          aria-label="Reminder date and time"
        />
      </Fld>
      <Fld label="Note (optional)">
        <textarea
          className="input min-h-[72px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Call back, send estimate, check permit status…"
          aria-label="Reminder note"
        />
      </Fld>
      <Fld label="Priority">
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {REMINDER_PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </Fld>
      <button type="button" className="btn-brand w-full" onClick={save}>
        Set reminder
      </button>
    </Sheet>
  );
}

function MustTodayNudgeSheet({ event, state: st, job, onClose, onDone }) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const isFirmer = (st.pushOffCount || 0) > 0;
  const message = isFirmer
    ? pickFirmerNudge(st.pushOffCount, event?.id || "")
    : "Still on your list for today — want to knock it out now or push it off a couple hours?";

  const openJob = () => {
    patchEventState(event.id, { handledAt: Date.now() });
    onDone();
    onClose();
    if (job?.id) nav("/job/" + encodeURIComponent(job.id));
    else nav("/today");
  };

  const pushTwoHours = () => {
    scheduleSameDayPushOff(event.id);
    showToast("OK — I'll ping you again in 2 hours");
    onDone();
    onClose();
  };

  const pushTomorrow = () => {
    scheduleNextBusinessDayReminder(event.id, st.note, todayStr());
    showToast("Moved to next business day");
    onDone();
    onClose();
  };

  return (
    <Sheet title={isFirmer ? "⏰ Take care of it today!" : "Reminder — today"} onClose={onClose}>
      <p className={`text-sm mb-4 ${isFirmer ? "text-red-700 font-medium" : "text-slate-600"}`}>{message}</p>
      <div className="text-sm space-y-1 mb-4 card px-3 py-2.5">
        <div className="font-semibold text-slate-900">{event?.summary || "Follow-up"}</div>
        {st.note ? <div className="text-slate-500">{st.note}</div> : null}
      </div>
      <button type="button" className="btn-brand w-full mb-2" onClick={openJob}>
        Open &amp; handle it
      </button>
      <button type="button" className="btn bg-amber-100 text-amber-900 w-full mb-2" onClick={pushTwoHours}>
        Push off — remind me in 2 hours
      </button>
      <button type="button" className="btn-ghost w-full text-slate-600" onClick={pushTomorrow}>
        Next business day only
      </button>
    </Sheet>
  );
}

function InspectionReminderSheet({ event, when, job, onClose, onDone }) {
  const nav = useNavigate();
  const label = when === "today" ? "Today" : "Tomorrow";

  const ack = () => {
    patchEventState(event.id, { inspectionAcked: true, handledAt: Date.now() });
    onDone();
    onClose();
  };

  const openJob = () => {
    patchEventState(event.id, { inspectionAcked: true, handledAt: Date.now() });
    onDone();
    onClose();
    if (job?.id) nav("/job/" + encodeURIComponent(job.id));
  };

  return (
    <Sheet title={`🔴 Inspection — ${label}`} onClose={ack}>
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
        <div className="font-bold text-red-800">{event?.summary || "Inspection"}</div>
        <div className="text-sm text-red-700 mt-1">{evStart(event).replace("T", " ").slice(0, 16)}</div>
        {event?.location ? <div className="text-sm text-red-600 mt-1">{event.location}</div> : null}
      </div>
      {job ? (
        <button type="button" className="btn bg-red-100 text-red-800 w-full mb-2" onClick={openJob}>
          Open job — {job.customer || "linked"}
        </button>
      ) : null}
      <button type="button" className="btn-brand w-full" onClick={ack} data-testid="inspection-thanks">
        Got it — thanks
      </button>
    </Sheet>
  );
}

function ServiceCallSheet({ event, job, suggestions, onClose, onDone, onCreateJob, onRemind, onEmail, onDoc }) {
  const nav = useNavigate();
  const notes = displayEventNotes(event?.description);
  const scenario = classifyAppointment(job);
  const copy = followUpCopy(scenario);
  const actions = followUpActions(scenario);

  const openJob = () => {
    if (!job?.id) return onCreateJob();
    patchEventState(event.id, { handledAt: Date.now(), linkedJobId: job.id });
    onDone();
    onClose();
    nav("/job/" + encodeURIComponent(job.id));
  };

  const runAction = (action) => {
    if (action.key === "create_job") return onCreateJob();
    if (action.key === "remind") return onRemind();
    if (action.key === "open_job") return openJob();
    if (action.key === "create_estimate") {
      patchEventState(event.id, { handledAt: Date.now(), linkedJobId: job?.id });
      onDone();
      onClose();
      return onDoc("estimate");
    }
    if (action.key === "create_invoice") {
      patchEventState(event.id, { handledAt: Date.now(), linkedJobId: job?.id });
      onDone();
      onClose();
      return onDoc("invoice");
    }
    if (action.key === "email_followup" || action.key === "email_invoice") {
      return onEmail(emailKindForAction(action.key, scenario));
    }
  };

  const dismiss = () => {
    patchEventState(event.id, { handledAt: Date.now() });
    onDone();
    onClose();
  };

  return (
    <Sheet title={copy.title} onClose={dismiss}>
      <p className="text-sm text-slate-600 mb-3">{copy.lead}</p>
      <div className="text-sm space-y-2 mb-4 card px-3 py-2.5">
        <div>
          <b className="font-semibold">Appointment</b>{" "}
          <span className="text-slate-600">{event?.summary || "—"}</span>
        </div>
        <div>
          <b className="font-semibold">When</b>{" "}
          <span className="text-slate-600">{evStart(event).replace("T", " ").slice(0, 16)}</span>
        </div>
        {event?.location ? (
          <div>
            <b className="font-semibold">Location</b> <span className="text-slate-600">{event.location}</span>
          </div>
        ) : null}
        {job ? (
          <div>
            <b className="font-semibold">Job</b>{" "}
            <span className="text-slate-600">{job.customer || "linked"}</span>
          </div>
        ) : null}
        {notes ? (
          <div>
            <b className="font-semibold">Notes</b>
            <p className="text-slate-600 whitespace-pre-wrap mt-1">{notes}</p>
          </div>
        ) : null}
      </div>
      {actions.map((action) =>
        action.key === "remind" ? (
          <Opt
            key={action.key}
            icon={action.icon}
            title={action.label}
            note="Pick a weekday, time, and priority"
            onClick={() => runAction(action)}
          />
        ) : (
          <button
            key={action.key}
            type="button"
            className={(action.primary ? "btn-brand" : "btn bg-slate-100 text-slate-800") + " w-full mb-2"}
            onClick={() => runAction(action)}
            data-testid={"followup-" + action.key}
          >
            {action.icon} {action.label}
          </button>
        )
      )}
      <button type="button" className="btn-ghost w-full mt-1" onClick={dismiss}>
        Skip for now
      </button>
    </Sheet>
  );
}

export default function FollowUpPrompts() {
  const { events, jobs, loading } = useStore();
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [subSheet, setSubSheet] = useState(null); // remind | createJob | email
  const nav = useNavigate();

  const today = todayStr();
  const refreshQueue = useCallback(() => {
    if (loading || !events?.length) return;
    const q = buildPromptQueue(events, jobs, today);
    setQueue(q);
    setCurrent((c) => c || q[0] || null);
  }, [events, jobs, loading, today]);

  useEffect(() => {
    if (loading || IS_TEST) return;
    if (sessionAlreadyPrompted()) {
      refreshQueue();
      return;
    }
    const q = buildPromptQueue(events, jobs, today);
    if (q.length) {
      const first = q[0];
      if (first.kind === "service_call" && !linkedJobForEvent(first.event, jobs)) {
        setSubSheet({ kind: "createJob", event: first.event, suggestions: first.suggestions });
        setQueue(q.slice(1));
        setCurrent(q[1] || null);
      } else {
        setQueue(q);
        setCurrent(first);
      }
      markSessionPrompted();
    }
  }, [loading, events, jobs, today, refreshQueue]);

  useEffect(() => {
    if (IS_TEST) return;
    const iv = setInterval(() => {
      const nudges = buildPromptQueue(events, jobs, today).filter((x) => x.kind === "must_today_nudge");
      if (nudges.length && !current) {
        setCurrent(nudges[0]);
        setQueue((q) => [...nudges, ...q.filter((x) => x.kind !== "must_today_nudge")]);
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [events, jobs, today, current]);

  const advance = useCallback(() => {
    setSubSheet(null);
    setQueue((q) => {
      const rest = q.slice(1);
      setCurrent(rest[0] || null);
      return rest;
    });
  }, []);

  if (!current && !subSheet) return null;

  if (subSheet?.kind === "createJob") {
    return (
      <CreateJobFromEventSheet
        event={subSheet.event}
        suggestions={subSheet.suggestions}
        onClose={() => setSubSheet(null)}
        onLinked={() => {
          patchEventState(subSheet.event.id, { handledAt: Date.now() });
          advance();
        }}
        onCreateNew={() => {
          patchEventState(subSheet.event.id, { handledAt: Date.now() });
          advance();
        }}
      />
    );
  }

  if (subSheet?.kind === "remind") {
    return (
      <RemindMeSheet
        event={subSheet.event}
        job={subSheet.job}
        onClose={() => setSubSheet(null)}
        onSaved={advance}
      />
    );
  }

  if (subSheet?.kind === "email") {
    return (
      <AppointmentEmailSheet
        job={subSheet.job}
        emailKind={subSheet.emailKind}
        title={subSheet.title}
        onClose={() => setSubSheet(null)}
      />
    );
  }

  if (!current) return null;

  if (current.kind === "must_today_nudge") {
    return (
      <MustTodayNudgeSheet
        event={current.event}
        state={current.state}
        job={current.job}
        onClose={advance}
        onDone={advance}
      />
    );
  }

  if (current.kind === "inspection") {
    return (
      <InspectionReminderSheet
        event={current.event}
        when={current.when}
        job={current.job}
        onClose={advance}
        onDone={advance}
      />
    );
  }

  if (current.kind === "service_call") {
    const linked = current.job || linkedJobForEvent(current.event, jobs);
    return (
      <ServiceCallSheet
        event={current.event}
        job={linked}
        suggestions={current.suggestions}
        onClose={advance}
        onDone={advance}
        onCreateJob={() =>
          setSubSheet({
            kind: "createJob",
            event: current.event,
            suggestions: current.suggestions,
          })
        }
        onRemind={() =>
          setSubSheet({
            kind: "remind",
            event: current.event,
            job: linked,
          })
        }
        onEmail={(emailKind) =>
          setSubSheet({
            kind: "email",
            job: linked,
            emailKind,
            title: emailKind === "invoice" ? "Payment reminder email" : "Estimate follow-up email",
          })
        }
        onDoc={(docKind) => {
          if (!linked?.id) return;
          nav("/job/" + encodeURIComponent(linked.id) + "?doc=" + docKind + "&create=1");
        }}
      />
    );
  }

  return null;
}