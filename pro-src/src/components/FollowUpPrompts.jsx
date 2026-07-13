// Login follow-up popups — service calls, must-today loop, inspections.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld } from "./Sheet.jsx";
import CreateJobFromEventSheet from "./CreateJobFromEventSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart } from "../lib/format.js";
import { todayStr } from "../lib/format.js";
import { linkedJobForEvent, displayEventNotes } from "../lib/calendarLink.js";
import {
  REMINDER_PRIORITIES,
  batchSnoozeReminders,
  buildPromptQueue,
  defaultRemindDatetime,
  dismissEventReminders,
  formatSnoozeDuration,
  generateReminderNudge,
  patchEventState,
  pickFirmerNudge,
  rescheduleEventReminder,
  scheduleNextBusinessDayReminder,
  scheduleReminderSnooze,
  snoozableQueueItems,
  validateRemindDatetime,
} from "../lib/followUpReminders.js";
import { stashCalendarPick } from "../lib/calendarNavigate.js";
import { askReminderNotifyPermission, notifyReminderDue } from "../lib/reminderNotify.js";
import ReminderDateTimePicker from "./ReminderDateTimePicker.jsx";
import SnoozePicker from "./SnoozePicker.jsx";

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
  const today = todayStr();
  const [dt, setDt] = useState(() => defaultRemindDatetime());
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("medium");

  const preview = generateReminderNudge({ event, job, userNote: note, today });

  const save = async () => {
    const err = validateRemindDatetime(dt);
    if (err) {
      showToast(err);
      return;
    }
    const nudge = generateReminderNudge({ event, job, userNote: note, today });
    patchEventState(event.id, {
      remindAt: dt,
      note,
      nudge,
      priority,
      pushOffCount: 0,
      nextNudgeAt: "",
    });
    if (job?.id) {
      await patchAndSave(job.id, {
        followUp: {
          type: "Follow-up",
          text: note || nudge || event.summary || "Follow up",
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

  const skipReminders = () => {
    dismissEventReminders(event.id, { noReminders: true });
    showToast("OK — no reminders for this appointment");
    onSaved && onSaved();
    onClose();
  };

  return (
    <Sheet title="Remind me" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">{event?.summary || "Appointment"}</p>
      <Fld label="When" hint="Pick a weekday, then choose a work-hour slot">
        <ReminderDateTimePicker value={dt} onChange={setDt} minDate={today} />
      </Fld>
      <Fld label="What's the reminder about? (optional)" hint="I'll turn this into a friendly nudge using your job history">
        <textarea
          className="input min-h-[72px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Still waiting on estimate approval, call back about panel quote…"
          aria-label="Reminder note"
          data-testid="reminder-note"
        />
      </Fld>
      {preview ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3 text-sm text-slate-600" data-testid="reminder-nudge-preview">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">I'll say something like</div>
          {preview}
        </div>
      ) : null}
      <Fld label="Priority">
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {REMINDER_PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </Fld>
      <button type="button" className="btn-brand w-full mb-2" onClick={save} data-testid="reminder-save">
        Remind me
      </button>
      <button type="button" className="btn-ghost w-full text-slate-500" onClick={skipReminders} data-testid="reminder-no-thanks">
        No reminders for this appointment
      </button>
    </Sheet>
  );
}

function RescheduleReminderSheet({ event, state: st, job, onClose, onSaved }) {
  const { patchAndSave, showToast } = useStore();
  const today = todayStr();
  const [dt, setDt] = useState(() => defaultRemindDatetime());

  const save = async () => {
    const err = validateRemindDatetime(dt);
    if (err) {
      showToast(err);
      return;
    }
    rescheduleEventReminder(event.id, dt, { note: st.note, priority: st.priority });
    if (job?.id) {
      await patchAndSave(job.id, {
        followUp: {
          type: "Follow-up",
          text: st.note || st.nudge || event.summary || "Follow up",
          date: dt.slice(0, 10),
          remind: true,
          priority: st.priority === "must_today" && dt.slice(0, 10) !== today ? "medium" : st.priority,
        },
      });
    }
    showToast("Reminder moved to " + dt.replace("T", " ").slice(0, 16));
    onSaved && onSaved();
    onClose();
  };

  return (
    <Sheet title="Move reminder" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">{event?.summary || "Appointment"}</p>
      <Fld label="New day & time" hint="Weekdays during work hours">
        <ReminderDateTimePicker value={dt} onChange={setDt} minDate={today} />
      </Fld>
      <button type="button" className="btn-brand w-full mb-2" onClick={save} data-testid="reminder-reschedule-save">
        Save new reminder time
      </button>
      <button type="button" className="btn-ghost w-full text-slate-500" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

function BatchSnoozeBar({ queue, onBatchSnooze }) {
  const snoozable = snoozableQueueItems(queue);
  if (snoozable.length < 2) return null;

  const handleSnooze = (minutes) => {
    const ids = snoozable.map((x) => x.event.id);
    onBatchSnooze(ids, minutes);
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-4" data-testid="batch-snooze-bar">
      <SnoozePicker
        label={`Snooze all ${snoozable.length} reminders`}
        onSnooze={handleSnooze}
        compact
      />
    </div>
  );
}

function MustTodayNudgeSheet({ event, state: st, job, queue, onClose, onDone, onReschedule, onSnooze, onBatchSnooze }) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const isFirmer = (st.pushOffCount || 0) > 0;
  const message = isFirmer
    ? pickFirmerNudge(st.pushOffCount, event?.id || "")
    : st.nudge || "Still on your list for today — want to knock it out now or snooze it?";

  const openJob = () => {
    patchEventState(event.id, { handledAt: Date.now() });
    onDone();
    onClose();
    if (job?.id) nav("/job/" + encodeURIComponent(job.id));
    else nav("/today");
  };

  const openInCalendar = () => {
    stashCalendarPick(event.id);
    onDone();
    onClose();
    nav("/today");
  };

  const snooze = (minutes) => {
    scheduleReminderSnooze(event.id, minutes);
    showToast("OK — I'll ping you again in " + formatSnoozeDuration(minutes));
    onSnooze && onSnooze();
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
      <BatchSnoozeBar queue={queue} onBatchSnooze={onBatchSnooze} />
      <p className={`text-sm mb-4 ${isFirmer ? "text-red-700 font-medium" : "text-slate-600"}`}>{message}</p>
      <div className="text-sm space-y-1 mb-4 card px-3 py-2.5">
        <div className="font-semibold text-slate-900">{event?.summary || "Follow-up"}</div>
        {st.note ? <div className="text-slate-500">{st.note}</div> : null}
      </div>
      <button type="button" className="btn-brand w-full mb-2" onClick={openJob}>
        Open &amp; handle it
      </button>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={openInCalendar} data-testid="reminder-open-calendar">
        📅 Open in calendar
      </button>
      <div className="mb-3">
        <SnoozePicker onSnooze={snooze} />
      </div>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={onReschedule} data-testid="reminder-move-day">
        Move to a different day
      </button>
      <button type="button" className="btn-ghost w-full text-slate-600" onClick={pushTomorrow}>
        Next business day only
      </button>
    </Sheet>
  );
}

function ScheduledReminderSheet({ event, state: st, job, queue, onClose, onDone, onReschedule, onSnooze, onBatchSnooze }) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const today = todayStr();
  const message = st.nudge || generateReminderNudge({ event, job, userNote: st.note, today });

  const openJob = () => {
    patchEventState(event.id, { handledAt: Date.now() });
    onDone();
    onClose();
    if (job?.id) nav("/job/" + encodeURIComponent(job.id));
    else nav("/today");
  };

  const openInCalendar = () => {
    stashCalendarPick(event.id);
    onDone();
    onClose();
    nav("/today");
  };

  const snooze = (minutes) => {
    scheduleReminderSnooze(event.id, minutes);
    showToast("Snoozed for " + formatSnoozeDuration(minutes));
    onSnooze && onSnooze();
    onDone();
    onClose();
  };

  const dismiss = () => {
    dismissEventReminders(event.id);
    onDone();
    onClose();
  };

  return (
    <Sheet title="🔔 Reminder" onClose={onClose}>
      <BatchSnoozeBar queue={queue} onBatchSnooze={onBatchSnooze} />
      <p className="text-sm text-slate-600 mb-4">{message}</p>
      <div className="text-sm space-y-1 mb-4 card px-3 py-2.5">
        <div className="font-semibold text-slate-900">{event?.summary || "Follow-up"}</div>
        {st.note ? <div className="text-slate-500">{st.note}</div> : null}
      </div>
      <button type="button" className="btn-brand w-full mb-2" onClick={openJob}>
        Open &amp; handle it
      </button>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={openInCalendar}>
        📅 Open in calendar
      </button>
      <div className="mb-3">
        <SnoozePicker onSnooze={snooze} />
      </div>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={onReschedule} data-testid="scheduled-reminder-move">
        Move to a different day
      </button>
      <button type="button" className="btn-ghost w-full text-slate-600" onClick={dismiss}>
        Got it — dismiss
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

function ServiceCallSheet({ event, job, onClose, onDone, onCreateJob, onRemind }) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const notes = displayEventNotes(event?.description);
  const today = todayStr();
  const lead = generateReminderNudge({ event, job, userNote: "", today });

  const openJob = () => {
    patchEventState(event.id, { handledAt: Date.now(), linkedJobId: job.id });
    onDone();
    onClose();
    nav("/job/" + encodeURIComponent(job.id));
  };

  const openInCalendar = () => {
    stashCalendarPick(event.id);
    onDone();
    onClose();
    nav("/today");
  };

  const skip = () => {
    patchEventState(event.id, { handledAt: Date.now() });
    onDone();
    onClose();
  };

  const noReminders = () => {
    dismissEventReminders(event.id, { noReminders: true });
    showToast("OK — won't ask about this one again");
    onDone();
    onClose();
  };

  return (
    <Sheet title="Follow up?" onClose={skip}>
      <p className="text-sm text-slate-600 mb-3">{lead}</p>
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
      <button type="button" className="btn-brand w-full mb-2" onClick={onRemind} data-testid="followup-remind">
        🔔 Remind me
      </button>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={openInCalendar} data-testid="followup-open-calendar">
        📅 Open in calendar
      </button>
      <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={noReminders} data-testid="followup-no-remind">
        Don't remind me
      </button>
      {job?.id ? (
        <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={openJob} data-testid="followup-open-job">
          📂 Open job
        </button>
      ) : (
        <button type="button" className="btn bg-slate-100 text-slate-800 w-full mb-2" onClick={onCreateJob} data-testid="followup-create-job">
          ＋ Create a job
        </button>
      )}
      <button type="button" className="btn-ghost w-full mt-1" onClick={skip} data-testid="followup-skip">
        Skip
      </button>
    </Sheet>
  );
}

export default function FollowUpPrompts() {
  const { events, jobs, loading, showToast } = useStore();
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [subSheet, setSubSheet] = useState(null); // remind | createJob
  const notifiedRef = useRef(new Set());

  const today = todayStr();

  const clearNotified = useCallback((eventIds) => {
    for (const id of eventIds || []) notifiedRef.current.delete(id);
  }, []);

  const notifyDueItem = useCallback(
    (item) => {
      if (!item?.event?.id || notifiedRef.current.has(item.event.id)) return;
      const title =
        item.kind === "must_today_nudge"
          ? "Must-do today"
          : item.kind === "scheduled_reminder"
            ? "Reminder"
            : item.kind === "inspection"
              ? "Inspection"
              : "Follow-up";
      const body =
        item.state?.nudge ||
        item.state?.note ||
        item.event?.summary ||
        generateReminderNudge({ event: item.event, job: item.job, userNote: item.state?.note, today });
      notifyReminderDue({ title, body, eventId: item.event.id });
      notifiedRef.current.add(item.event.id);
    },
    [today]
  );

  const refreshQueue = useCallback(() => {
    if (loading || !events?.length) return;
    const q = buildPromptQueue(events, jobs, today);
    setQueue(q);
    setCurrent((c) => c || q[0] || null);
  }, [events, jobs, loading, today]);

  useEffect(() => {
    if (loading || IS_TEST) return;
    askReminderNotifyPermission();
    if (sessionAlreadyPrompted()) {
      refreshQueue();
      return;
    }
    const q = buildPromptQueue(events, jobs, today);
    if (q.length) {
      setQueue(q);
      setCurrent(q[0]);
      markSessionPrompted();
    }
  }, [loading, events, jobs, today, refreshQueue]);

  useEffect(() => {
    if (IS_TEST) return;
    const tick = () => {
      const q = buildPromptQueue(events, jobs, today);
      const dueNow = q.filter((x) => x.kind === "must_today_nudge" || x.kind === "scheduled_reminder");
      if (!dueNow.length) return;
      dueNow.forEach(notifyDueItem);
      if (!current) {
        setCurrent(dueNow[0]);
        setQueue((prev) => {
          const rest = prev.filter((x) => x.kind !== "must_today_nudge" && x.kind !== "scheduled_reminder");
          return [...dueNow, ...rest];
        });
      }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [events, jobs, today, current, notifyDueItem]);

  const handleBatchSnooze = useCallback(
    (eventIds, minutes) => {
      batchSnoozeReminders(eventIds, minutes);
      clearNotified(eventIds);
      showToast("Snoozed " + eventIds.length + " reminders for " + formatSnoozeDuration(minutes));
      setQueue((q) => {
        const rest = q.filter((x) => !eventIds.includes(x.event?.id));
        setCurrent((c) => (c && eventIds.includes(c.event?.id) ? rest[0] || null : c));
        return rest;
      });
    },
    [clearNotified, showToast]
  );

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

  if (subSheet?.kind === "reschedule") {
    return (
      <RescheduleReminderSheet
        event={subSheet.event}
        state={subSheet.state}
        job={subSheet.job}
        onClose={() => setSubSheet(null)}
        onSaved={advance}
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
        queue={queue}
        onClose={advance}
        onDone={advance}
        onSnooze={() => clearNotified([current.event.id])}
        onBatchSnooze={handleBatchSnooze}
        onReschedule={() =>
          setSubSheet({
            kind: "reschedule",
            event: current.event,
            state: current.state,
            job: current.job,
          })
        }
      />
    );
  }

  if (current.kind === "scheduled_reminder") {
    return (
      <ScheduledReminderSheet
        event={current.event}
        state={current.state}
        job={current.job}
        queue={queue}
        onClose={advance}
        onDone={advance}
        onSnooze={() => clearNotified([current.event.id])}
        onBatchSnooze={handleBatchSnooze}
        onReschedule={() =>
          setSubSheet({
            kind: "reschedule",
            event: current.event,
            state: current.state,
            job: current.job,
          })
        }
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
      />
    );
  }

  return null;
}