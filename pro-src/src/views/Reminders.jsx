// Reminders tab — every active reminder in priority order, synced with popups.
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { todayStr } from "../lib/format.js";
import PauseRemindersBar from "../components/PauseRemindersBar.jsx";
import VerifyReminderButton from "../components/VerifyReminderButton.jsx";
import UnsentDocActions from "../components/UnsentDocActions.jsx";
import {
  REMINDER_PRIORITIES,
  buildReminderList,
  dismissEventReminders,
  isRemindersPaused,
  scheduleReminderSnooze,
} from "../lib/followUpReminders.js";
import { unsentDocCardFields } from "../lib/followUpStatus.js";

const PRIORITY_LABEL = Object.fromEntries(REMINDER_PRIORITIES.map((p) => [p.key, p.label]));

function priorityPill(priority) {
  if (priority === "must_today") return "bg-red-100 text-red-800";
  if (priority === "high") return "bg-amber-100 text-amber-900";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-sky-100 text-sky-800";
}

function ReminderRow({ item, expanded, onToggle, onAction }) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const label = PRIORITY_LABEL[item.priority] || "Reminder";

  const openJob = () => {
    if (item.job?.id) nav("/job/" + encodeURIComponent(item.job.id));
    else if (item.event?.id) nav("/today");
  };

  const dontRemind = () => {
    if (item.event?.id) {
      dismissEventReminders(item.event.id, { noReminders: true });
      showToast("OK — won't remind you about this one");
      onAction();
    }
  };

  const snooze = (minutes) => {
    if (item.event?.id) {
      scheduleReminderSnooze(item.event.id, minutes);
      showToast("Snoozed " + minutes + " min");
      onAction();
    }
  };

  return (
    <div className="card overflow-hidden" data-testid="reminder-row">
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-2"
        onClick={onToggle}
        data-testid={"reminder-headline-" + item.id}
      >
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 truncate">{item.headline}</div>
          {!expanded && item.detail ? (
            <div className="text-sm text-slate-500 truncate mt-0.5">{item.detail}</div>
          ) : null}
        </div>
        <span className={"pill shrink-0 text-[10px] " + priorityPill(item.priority)}>{label}</span>
        <span className="text-slate-400 shrink-0">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded ? (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
          {item.detail ? <p className="text-sm text-slate-600">{item.detail}</p> : null}
          {item.kind === "unsent_doc" && item.job ? (
            <div className="text-sm space-y-1.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5" data-testid="reminder-unsent-card">
              {item.job.customer ? (
                <div className="font-semibold text-slate-800">{item.job.customer}</div>
              ) : null}
              {unsentDocCardFields(item.job, item.docKind).rows.map((r) => (
                <div key={r.label} className="flex gap-2 justify-between">
                  <span className="text-slate-500 shrink-0">{r.label}</span>
                  <span className="text-slate-800 font-medium text-right break-words">{r.value}</span>
                </div>
              ))}
            </div>
          ) : item.job?.customer ? (
            <div className="text-sm text-slate-500">{item.job.customer}</div>
          ) : null}
          {item.dueAt ? (
            <div className="text-xs text-slate-400">
              Due {String(item.dueAt).replace("T", " ").slice(0, 16)}
            </div>
          ) : null}

          {item.kind === "unsent_doc" && item.job ? (
            <UnsentDocActions
              job={item.job}
              docKind={item.docKind}
              docNo={item.docNo}
              onAction={onAction}
            />
          ) : null}

          {item.kind !== "unsent_doc" && item.job?.id ? (
            <button type="button" className="btn bg-slate-100 text-slate-800 w-full" onClick={openJob}>
              Open job
            </button>
          ) : null}

          {item.kind !== "unsent_doc" ? (
            <VerifyReminderButton
              item={item}
              onStart={onAction}
              onDone={onAction}
              className="btn bg-violet-100 text-violet-900 w-full border border-violet-200"
            />
          ) : null}

          {item.kind !== "unsent_doc" && item.event?.id ? (
            <>
              <Link to="/today" className="btn bg-slate-100 text-slate-800 w-full block text-center">
                Open calendar
              </Link>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 30].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700"
                    onClick={() => snooze(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost w-full text-slate-600" onClick={dontRemind} data-testid="reminder-dont-remind">
                Don't remind me
              </button>
            </>
          ) : null}

          {item.kind === "inspection" ? (
            <button
              type="button"
              className="btn-brand w-full"
              onClick={() => {
                if (item.event?.id) dismissEventReminders(item.event.id);
                showToast("Got it");
                onAction();
              }}
            >
              Got it
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Reminders() {
  const { events, jobs, commands } = useStore();
  const today = todayStr();
  const [expandedId, setExpandedId] = useState(null);
  const [tick, setTick] = useState(0);

  const list = useMemo(
    () => buildReminderList(events, jobs, today, new Date(), commands),
    [events, jobs, today, commands, tick]
  );

  const paused = isRemindersPaused();

  return (
    <div data-testid="reminders-view">
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Reminders</h1>
      <p className="text-sm text-slate-500 mb-3">
        Same list as your pop-ups — tap a headline to expand and act.
      </p>

      <PauseRemindersBar />

      {paused ? (
        <div className="card px-4 py-3 text-sm text-amber-800 bg-amber-50 border-amber-200 mb-3" data-testid="reminders-paused-note">
          Pop-ups are paused — resume above when you're ready.
        </div>
      ) : null}

      {!list.length ? (
        <div className="card px-4 py-8 text-center text-slate-500" data-testid="reminders-empty">
          Nothing on your plate right now.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((item) => (
            <ReminderRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              onAction={() => setTick((t) => t + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}