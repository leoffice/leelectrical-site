// Jobs view — search, filter chips, cards, and customer grouping:
// jobs sharing a customer/clientGroup collapse into an expandable group row.
import React, { useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import JobCard from "../components/JobCard.jsx";
import { FILTER_NAMES, clientKey, matchesFilter, matchesQuery } from "../lib/stages.js";

export default function Jobs() {
  const { jobs, loading } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Active");
  const [open, setOpen] = useState({}); // groupKey -> expanded

  const shown = useMemo(
    () => jobs.filter((j) => matchesFilter(j, filter) && matchesQuery(j, q)),
    [jobs, filter, q]
  );

  // Group consecutive-by-customer: single jobs render flat, multi-job
  // customers render one expandable group row.
  const groups = useMemo(() => {
    const map = new Map();
    for (const j of shown) {
      const k = clientKey(j);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(j);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <div className="space-y-3">
      <input
        className="input"
        type="search"
        placeholder="Search customer, job, invoice #…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
        {FILTER_NAMES.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip ${
              filter === f ? "bg-brand text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && !jobs.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">Loading jobs…</div>
      ) : !shown.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">
          No {filter.toLowerCase()} jobs{q ? ` matching “${q}”` : ""}.
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map(([key, list]) =>
            list.length === 1 ? (
              <JobCard key={list[0].id} job={list[0]} />
            ) : (
              <div key={key} className="card overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                >
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-soft text-accent font-bold text-sm shrink-0">
                    {(list[0].customer || "?").trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 truncate">
                      {list[0].customer || "(no customer)"}
                    </span>
                    <span className="block text-xs text-slate-500">{list.length} jobs</span>
                  </span>
                  <span className={`ml-auto text-slate-400 transition-transform ${open[key] ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>
                {open[key] && (
                  <div className="px-3 pb-3 space-y-2 bg-slate-50/60 border-t border-slate-100 pt-3">
                    {list.map((j) => (
                      <JobCard key={j.id} job={j} compact />
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
      <div className="text-center text-xs text-slate-400 pt-1">
        {shown.length} of {jobs.length} jobs
      </div>
    </div>
  );
}
