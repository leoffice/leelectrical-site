// Today — appointments from the calendar store, follow-ups due, and totals.
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { currentStage, isInvoiced, isPaid, todayStr } from "../lib/stages.js";

function timeOf(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Today() {
  const { jobs, events } = useStore();
  const today = todayStr();

  const todaysEvents = useMemo(
    () =>
      (events || [])
        .filter((e) => {
          const s = e.start && (e.start.dateTime || e.start.date || e.start);
          return typeof s === "string" && s.slice(0, 10) === today;
        })
        .sort((a, b) => {
          const sa = a.start?.dateTime || a.start?.date || a.start || "";
          const sb = b.start?.dateTime || b.start?.date || b.start || "";
          return String(sa).localeCompare(String(sb));
        }),
    [events, today]
  );

  const dueFollowUps = useMemo(
    () =>
      jobs.filter((j) => j.followUp && j.followUp.date && j.followUp.date <= today && !isPaid(j)),
    [jobs, today]
  );

  const active = jobs.filter((j) => !isPaid(j) && currentStage(j) !== null);
  const unpaid = jobs.filter((j) => isInvoiced(j) && !isPaid(j));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ["Active", active.length, "text-brand"],
          ["Unpaid", unpaid.length, "text-orange-600"],
          ["Due today", dueFollowUps.length, "text-accent"],
        ].map(([label, n, tone]) => (
          <div key={label} className="card px-3 py-3 text-center">
            <div className={`text-2xl font-extrabold ${tone}`}>{n}</div>
            <div className="text-[11px] font-medium text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Appointments</h2>
        {!todaysEvents.length ? (
          <div className="card px-4 py-5 text-sm text-slate-400 text-center">Nothing on the calendar today.</div>
        ) : (
          <div className="space-y-2">
            {todaysEvents.map((e, i) => (
              <div key={e.id || i} className="card px-4 py-3 flex items-center gap-3">
                <span className="pill bg-brand-soft text-brand shrink-0">
                  {timeOf(e.start?.dateTime || e.start) || "All day"}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{e.summary || "(no title)"}</div>
                  {e.location && <div className="text-xs text-slate-500 truncate">{e.location}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Follow-ups due</h2>
        {!dueFollowUps.length ? (
          <div className="card px-4 py-5 text-sm text-slate-400 text-center">You’re all caught up ⚡</div>
        ) : (
          <div className="space-y-2">
            {dueFollowUps.map((j) => (
              <Link key={j.id} to={`/job/${encodeURIComponent(j.id)}`} className="card block px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{j.customer}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {j.followUp.text || j.followUp.type || "Follow up"}
                    </div>
                  </div>
                  <span
                    className={`ml-auto pill shrink-0 ${
                      j.followUp.date < today ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {j.followUp.date < today ? `overdue · ${j.followUp.date}` : "today"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
