// Today — totals row, follow-ups due, upcoming appointments with "+ Job".
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { prefillFromEvent } from "../components/NewJobFlow.jsx";
import { evStart, fmt$, parseAmount, todayStr } from "../lib/format.js";

export default function Today() {
  const { jobs, events, setNewJob } = useStore();
  const t = todayStr();
  const js = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);

  const due = useMemo(
    () => js.filter((j) => j.followUp && j.followUp.date && j.followUp.date <= t && !j.paid),
    [js, t]
  );
  // Window Levi wants: 2 weeks back through 1 week ahead, excluding "inspection" events.
  const fromStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); }, []);
  const toStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }, []);
  const appts = useMemo(
    () =>
      (events || [])
        .filter((e) => {
          const d = evStart(e).slice(0, 10);
          return d >= fromStr && d <= toStr && !/inspection/i.test(e.summary || "");
        })
        .sort((a, b) => (evStart(a) < evStart(b) ? -1 : 1))
        .slice(0, 40),
    [events, fromStr, toStr]
  );
  const unpaid = js.filter((j) => !j.paid && j.invoiceNo);
  const owed = unpaid.reduce((s, j) => s + parseAmount(j.amount), 0);

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
                  <div className="ml-auto font-bold shrink-0">{fmt$(j.amount)}</div>
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
          Upcoming appointments
        </h2>
        {!appts.length ? (
          <div className="card px-4 py-5 text-sm text-slate-400 text-center">No synced appointments.</div>
        ) : (
          <div className="space-y-2">
            {appts.map((e, i) => (
              <div key={e.id || i} className="card px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">{e.summary || "Appointment"}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {evStart(e).replace("T", " ").slice(0, 16)}
                    {e.location ? " · " + e.location : ""}
                  </div>
                </div>
                <button
                  className="btn bg-brand-soft text-brand !py-2 shrink-0"
                  onClick={() => setNewJob({ step: "form", prefill: prefillFromEvent(e) })}
                >
                  + Job
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
