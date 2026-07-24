// Calendar — totals, to-do / upcoming follow-ups, week schedule.
// Opening an appointment expands under the calendar (not a covering modal).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import AppointmentDetailSheet from "../components/AppointmentDetailSheet.jsx";
import WeekCalendar from "../components/WeekCalendar.jsx";
import {
  CALENDAR_PICK_EVENT,
  clearCalendarPick,
  peekCalendarPick,
  peekReminderReturn,
  resolveCalendarPick,
  signalRestoreReminder,
  stashReminderReturn,
} from "../lib/calendarNavigate.js";
import { fmtAmountDue, openBalance, totalBalanceDue } from "../lib/customers.js";
import { bucketFollowUps, dueDateTone, followUpDate, followUpLabel } from "../lib/calendarDue.js";
import { evStart, fmt$, todayStr } from "../lib/format.js";
import { displayEventNotes, searchCalendarEvents } from "../lib/calendarLink.js";
import { TappableAddress } from "../components/TappableContact.jsx";

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
  const [weekFocusDate, setWeekFocusDate] = useState("");
  const [calQuery, setCalQuery] = useState("");
  const [reminderReturn, setReminderReturn] = useState(() => peekReminderReturn());
  const focusRef = useRef(null);
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

  // Open schedule calendar / Open in calendar — resolve pick once events are ready.
  // Do NOT consume the pick until we can resolve it (race when events still loading).
  useEffect(() => {
    const applyPick = () => {
      const raw = peekCalendarPick();
      if (!raw) return;
      // Events not in memory yet — still jump the week so the tab visibly moves.
      // Keep the pick so we expand the appointment once the list arrives.
      if (raw.eventId && (!events || !events.length)) {
        if (raw.focusDate) setWeekFocusDate(raw.focusDate);
        return;
      }
      const resolved = resolveCalendarPick(events, raw);
      if (!resolved) {
        clearCalendarPick();
        return;
      }
      if (resolved.event) {
        clearCalendarPick();
        setPicked(resolved.event);
        setWeekFocusDate("");
        return;
      }
      // Events loaded (or date-only pick) but no matching event — jump the week grid.
      if (resolved.focusDate) {
        clearCalendarPick();
        setWeekFocusDate(resolved.focusDate);
        setPicked(null);
      }
    };
    applyPick();
    window.addEventListener(CALENDAR_PICK_EVENT, applyPick);
    return () => window.removeEventListener(CALENDAR_PICK_EVENT, applyPick);
  }, [events]);

  // When an event opens (tap or deep-link), keep calendar at the top of the page.
  useEffect(() => {
    if (!picked) return;
    const el = focusRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      try {
        el.scrollIntoView(true);
      } catch {
        /* ignore */
      }
    }
  }, [picked?.id]);

  const js = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);
  const buckets = useMemo(() => bucketFollowUps(js, t), [js, t]);
  const todo = useMemo(() => [...buckets.overdue, ...buckets.todayDue], [buckets]);
  const unpaid = js.filter((j) => !j.paid && openBalance(j) > 0);
  const owed = totalBalanceDue(unpaid);

  const showReminderBack = reminderReturn && (!picked || reminderReturn.apptClosed);
  const focusDate = picked ? evStart(picked).slice(0, 10) : weekFocusDate || "";

  // Focused layout: calendar on top, event card expanding below (edit lives there too).
  if (picked) {
    return (
      <div className="space-y-4" data-testid="calendar-view" data-appt-open="1">
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

        <section ref={focusRef} data-testid="calendar-focus-panel">
          <div className="flex items-center gap-2 mb-2 px-1">
            <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex-1">
              Schedule — Mon through Fri
            </h2>
            <button
              type="button"
              className="text-[11px] font-semibold text-brand"
              onClick={closeAppointment}
              data-testid="appt-close-focus"
            >
              Close
            </button>
          </div>
          <div className="card px-3 py-3">
            <WeekCalendar
              events={events}
              onPickEvent={setPicked}
              selectedEventId={picked.id}
              focusDate={focusDate}
            />
          </div>
          <div className="mt-3" data-testid="appt-expand-panel">
            <AppointmentDetailSheet event={picked} onClose={closeAppointment} inline />
          </div>
        </section>
      </div>
    );
  }

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

      <section ref={focusRef}>
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
                const when = formatWhen(e);
                const noteBits = displayEventNotes(e.description).slice(0, 60);
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
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                      {when}
                      {e.location ? (
                        <>
                          {" · "}
                          <TappableAddress address={e.location} className="text-[11px]" />
                        </>
                      ) : null}
                      {noteBits ? ` · ${noteBits}` : null}
                    </div>
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
          <WeekCalendar events={events} onPickEvent={setPicked} focusDate={focusDate || undefined} />
        </div>
      </section>
    </div>
  );
}
