// Today — totals row, follow-ups due, calendar appointments (±2 weeks).
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { prefillFromEvent } from "../components/NewJobFlow.jsx";
import Sheet from "../components/Sheet.jsx";
import WeekCalendar from "../components/WeekCalendar.jsx";
import { fmtAmountDue, openBalance, totalBalanceDue } from "../lib/customers.js";
import { evStart, fmt$, todayStr } from "../lib/format.js";

export default function Today() {
  const { jobs, events, setNewJob } = useStore();
  const [picked, setPicked] = useState(null);
  const t = todayStr();
  const js = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);

  const due = useMemo(
    () => js.filter((j) => j.followUp && j.followUp.date && j.followUp.date <= t && !j.paid),
    [js, t]
  );
  const unpaid = js.filter((j) => !j.paid && openBalance(j) > 0);
  const owed = totalBalanceDue(unpaid);

  return (
    <div className="space-y-4">
      <div className="card px-4 py-3.5 flex">
        {[
          ["Open jobs", js.filter((j) => !j.paid).length],
          ["Unpaid invoices", unpaid.length],
          ["Outstanding", fmt$(owed) || "$0"],
        ].map(([label, n]) => (
          <div key={label} className="flex-1">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-[22px] font-extrabold text-slate-900">{n}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Follow-ups due
        </h2>
        {!due.length ? (
          <div className="card px-4 py-5 text-sm text-slate-400 text-center">Nothing due. 🎉</div>
        ) : (
          <div className="space-y-2">
            {due.map((j) => (
              <Link key={j.id} to={`/job/${encodeURIComponent(j.id)}`} className="card block px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-slate-900 truncate">{j.customer}</div>
                  <div className="ml-auto font-bold shrink-0">{fmtAmountDue(j) || "—"}</div>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  📌 {j.followUp.text || j.followUp.type || "Follow up"} —{" "}
                  <b className="text-red-600">{j.followUp.date}</b>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Schedule — Mon through Fri
        </h2>
        <div className="card px-3 py-3">
          <WeekCalendar events={events} onPickEvent={setPicked} />
        </div>
      </section>

      {picked && (
        <Sheet title={picked.summary || "Appointment"} onClose={() => setPicked(null)}>
          <div className="text-sm space-y-2 mb-4">
            <div>
              <b className="font-semibold">When</b>{" "}
              <span className="text-slate-600">{evStart(picked).replace("T", " ").slice(0, 16)}</span>
            </div>
            {picked.location ? (
              <div>
                <b className="font-semibold">Location</b> <span className="text-slate-600">{picked.location}</span>
              </div>
            ) : null}
            {picked.description ? (
              <div>
                <b className="font-semibold">Notes</b>
                <p className="text-slate-600 whitespace-pre-wrap mt-1">{picked.description}</p>
              </div>
            ) : null}
          </div>
          <button
            className="btn-brand w-full"
            onClick={() => {
              setPicked(null);
              setNewJob({ step: "form", prefill: prefillFromEvent(picked) });
            }}
          >
            ＋ Create job from appointment
          </button>
        </Sheet>
      )}
    </div>
  );
}
