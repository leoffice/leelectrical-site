// Jobs view — search, filter chips, amount-sorted cards, customer grouping
// (clientGroup OR normalized name), and per-card quick actions.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import JobCard from "../components/JobCard.jsx";
import MergePrompt from "../components/MergePrompt.jsx";
import { MarkPaidSheet, QuickSendSheet } from "../components/JobSheets.jsx";
import { FILTER_NAMES, clientKey, matchesFilter, matchesQuery, sortJobs } from "../lib/stages.js";
import { normalizeCustomer } from "../lib/customers.js";
import { fmt$, parseAmount } from "../lib/format.js";

const IDLE_COLLAPSE_MS = 8000; // expanded customer rows fold back after ~8s idle

export default function Jobs({ embedded }) {
  const { jobs, loading, showToast } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Active");
  const [open, setOpen] = useState({}); // groupKey -> expanded
  const [sheet, setSheet] = useState(null); // {kind:"paid"|"send", job}
  const timers = useRef({}); // groupKey -> auto-collapse timer

  const active = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);
  const shown = useMemo(
    () => sortJobs(active.filter((j) => matchesFilter(j, filter) && matchesQuery(j, q))),
    [active, filter, q]
  );

  // Bug #1: key = clientGroup || normalized customer name. A second pass
  // folds name-keyed jobs into an existing clientGroup row for the same
  // customer, so a customer can never show as a group AND loose cards.
  const groups = useMemo(() => {
    const map = new Map();
    for (const j of shown) {
      const k = clientKey(j);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(j);
    }
    const nameToGroup = new Map(); // normalized name -> first "g:" key containing it
    for (const [k, list] of map) {
      if (!k.startsWith("g:")) continue;
      for (const j of list) {
        const n = normalizeCustomer(j.customer);
        if (n && !nameToGroup.has(n)) nameToGroup.set(n, k);
      }
    }
    for (const [k, list] of [...map]) {
      if (!k.startsWith("c:")) continue;
      const target = nameToGroup.get(k.slice(2));
      if (target) {
        map.set(target, sortJobs(map.get(target).concat(list)));
        map.delete(k);
      }
    }
    return [...map.entries()];
  }, [shown]);

  /* auto-collapse an expanded row after ~8s without interaction */
  const armCollapse = (key) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(
      () => setOpen((o) => (o[key] ? { ...o, [key]: false } : o)),
      IDLE_COLLAPSE_MS
    );
  };
  const toggleGroup = (key) => {
    setOpen((o) => {
      const now = !o[key];
      if (now) armCollapse(key);
      else clearTimeout(timers.current[key]);
      return { ...o, [key]: now };
    });
  };
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const quickSend = (job) => {
    if (!job.email) return showToast("No email on file — add one first");
    setSheet({ kind: "send", job });
  };

  return (
    <div className="space-y-3">
      <input
        className="input"
        type="search"
        placeholder="🔍  Search customer, job, address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search jobs"
      />

      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
        {FILTER_NAMES.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip ${
              filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"
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
          <span className="block text-3xl mb-2">🗂️</span>
          No jobs match.
          <br />
          Try another filter, or hit ＋ to add a job.
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map(([key, list]) =>
            list.length === 1 ? (
              <JobCard
                key={list[0].id}
                job={list[0]}
                onQuickSend={quickSend}
                onMarkPaid={(j) => setSheet({ kind: "paid", job: j })}
              />
            ) : (
              <div key={key} className="card overflow-hidden" data-testid="client-group">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  onClick={() => toggleGroup(key)}
                >
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-soft text-accent font-bold text-sm shrink-0">
                    {(list[0].customer || "").trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 truncate">
                      {list[0].customer || "(no customer)"}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {list.length} jobs · {fmt$(list.reduce((s, j) => s + parseAmount(j.amount), 0)) || "$0"} ·{" "}
                      {list.filter((j) => !j.paid).length} unpaid
                    </span>
                  </span>
                  <span className={`ml-auto text-slate-400 transition-transform ${open[key] ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>
                {open[key] && (
                  <div
                    className="px-3 pb-3 space-y-2 bg-slate-50/60 border-t border-slate-100 pt-3"
                    onPointerDown={() => armCollapse(key)}
                  >
                    {list.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        compact
                        onQuickSend={quickSend}
                        onMarkPaid={(x) => setSheet({ kind: "paid", job: x })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
      {!embedded && (
        <div className="text-center text-xs text-slate-400 pt-1">
          {shown.length} of {active.length} jobs
        </div>
      )}

      {!embedded && <MergePrompt />}

      {sheet?.kind === "paid" && <MarkPaidSheet job={sheet.job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "send" && <QuickSendSheet job={sheet.job} onClose={() => setSheet(null)} />}
    </div>
  );
}
