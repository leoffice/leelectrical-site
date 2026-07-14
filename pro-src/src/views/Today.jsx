// Calendar — totals, to-do / upcoming follow-ups, week schedule.
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import AppointmentDetailSheet from "../components/AppointmentDetailSheet.jsx";
import WeekCalendar from "../components/WeekCalendar.jsx";
import {
  consumeCalendarPick,
  peekReminderReturn,
  signalRestoreReminder,
  stashReminderReturn,
} from "../lib/calendarNavigate.js";
import { fmtAmountDue, openBalance, totalBalanceDue } from "../lib/customers.js";
import { bucketFollowUps, dueDateTone, followUpDate, followUpLabel } from "../lib/calendarDue.js";
import { evStart, fmt$, todayStr } from "../lib/format.js";
import { displayEventNotes, searchCalendarEvents } from "../lib/calendarLink.js";

function FollowUpRow({ job, dateTone }) {
  const d = followUpDate(job);
  const tone =
    dateTone ||
    (dueDateTone(d) === "overdue"
      ? "text-red-600"
      : dueDateTone(d) === "today"
        ? "text-amber-700"
        : "text-slate-600");
  return (
    <Link key={job.id} to={`/job/${encodeURIComponent(job.id)}`} className="card block px-3 py-2.5 lg:px-4 lg:py-3">
      <div className="flex items-start gap-2">
        <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 break-words min-w-0 flex-1 lg:text-base lg:font-bold">
          {job.customer}
        </div>
        <div className="ml-auto text-sm font-semibold shrink-0 lg:font-bold">{fmtAmountDue(job) || "—"}</div>
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5 lg:text-xs">
        📌 {followUpLabel(job)} — <b className={tone}>{d}</b>
      </div>
    </Link>
  );
}

function FollowUpSection({ title, jobs, empty, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!jobs.length) return empty ? null : <div className="card px-4 py-4 text-sm text-slate-400 text-center">{empty}</div>;
  return (
    <section>
      <button
        type="button"
        className="w-full flex items-center gap-2 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 px-1"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex-1 text-left">{title}</span>
        <span className="text-slate-400 normal-case font-semibold">{jobs.length}</span>
        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="space-y-2">{jobs.map((j) => <FollowUpRow key={j.id} job={j} />)}</div> : null}
    </section>
  );
}

function formatWhen(event) {
  return evStart(event).replace("T", " ").slice(0, 16) || "—";
}

export default function Today() {
  const { jobs, events } = useStore();
  const [picked, setPicked] = useState(null);
  const [calQuery, setCalQuery] = useState("");
  const [reminderReturn, setReminderReturn] = useState(() => peekReminderReturn());
  const t = todayStr();
  const calMatches = useMemo(() => searchCalendarEvents(events, calQuery), [events, calQuery]);

  const refreshReminderReturn = () => setReminderReturn(peekReminderReturn());

  const closeAppointment = () => {
    const ret = peekReminderReturn();
    if (ret?.eventId && picked && String(ret.eventId) === String(picked.id)) {
      stashReminderReturn({ ...ret, apptClosed: true });
      refreshReminderReturn();
    }
    setPicked(null);
  };

  const backToReminder = () => {
    signalRestoreReminder();
    setReminderReturn(null);
  };

  useEffect(() => {
    const pickId = consumeCalendarPick();
    if (!pickId || !events?.length) return;
    const ev = events.find((e) => String(e.id) === String(pickId));
    if (ev) setPicked(ev);
  }, [events]);
  const js = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);
  const buckets = useMemo(() => bucketFollowUps(js, t), [js, t]);
  const todo = useMemo(() => [...buckets.overdue, ...buckets.todayDue], [buckets]);
  const unpaid = js.filter((j) => !j.paid && openBalance(j) > 0);
  const owed = totalBalanceDue(unpaid);

  const showReminderBack = reminderReturn && (!picked || reminderReturn.apptClosed);

  return (
    <div className="space-y-4" data-testid="calendar-view">
      {showReminderBack ? (
        <button
          type="button"
          className="card w-full text-left px-3 py-2.5 flex items-center gap-2 text-sm font-semibold text-brand active:opacity-90"
          onClick={backToReminder}
          data-testid="back-to-reminder"
        >
          <span>←</span>
          <span>Back to reminder</span>
        </button>
      ) : null}
      <div className="card px-3 py-2.5 flex lg:px-4 lg:py-3.5">
        {[
          ["Open jobs", js.filter((j) => !j.paid).length],
          ["Unpaid invoices", unpaid.length],
          ["Outstanding", fmt$(owed) || "$0"],
        ].map(([label, n]) => (
          <div key={label} className="flex-1 min-w-0">
            <div className="text-[10px] text-slate-500 lg:text-xs">{label}</div>
            <div className="text-base font-bold text-slate-900 truncate lg:text-[22px] lg:font-extrabold">{n}</div>
          </div>
        ))}
      </div>

      <FollowUpSection
        title="To-do — overdue & today"
        jobs={todo}
        empty={!buckets.all.length ? "No follow-ups set yet." : "Nothing due today. 🎉"}
      />

      <FollowUpSection title="Tomorrow" jobs={buckets.tomorrowDue} />

      <FollowUpSection title="Next 3 days" jobs={buckets.next3} />

      {buckets.later.length ? (
        <FollowUpSection title="Later" jobs={buckets.later} defaultOpen={false} />
      ) : null}

      <section>
        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Schedule — Mon through Fri
        </h2>
        <input
          className="input mb-2"
          placeholder="Search appointments — name, address, date…"
          value={calQuery}
          onChange={(e) => setCalQuery(e.target.value)}
          aria-label="Search calendar appointments"
          data-testid="cal-tab-search"
        />
        {calQuery ? (
          calMatches.length ? (
            <div className="space-y-2 mb-3" data-testid="cal-tab-search-results">
              {calMatches.slice(0, 12).map((e) => {
                const note = [
                  formatWhen(e),
                  e.location || "",
                  displayEventNotes(e.description).slice(0, 60),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={e.id || evStart(e) + e.summary}
                    type="button"
                    className="card block w-full text-left px-3 py-2.5 active:opacity-90"
                    onClick={() => {
                      setPicked(e);
                      setCalQuery("");
                    }}
                  >
                    <div className="text-sm font-semibold text-slate-900 line-clamp-2">{e.summary || "Appointment"}</div>
                    {note ? <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{note}</div> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-3 mb-2" data-testid="cal-tab-search-empty">
              No appointments match your search.
            </p>
          )
        ) : null}
        <div className="card px-3 py-3">
          <WeekCalendar events={events} onPickEvent={setPicked} />
        </div>
      </section>

      {picked && <AppointmentDetailSheet event={picked} onClose={closeAppointment} />}
    </div>
  );
}