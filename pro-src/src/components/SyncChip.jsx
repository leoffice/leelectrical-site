// Header sync chip — opens scoped QuickBooks sync menu (context-aware on detail pages).
import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useStoreData } from "../state/store.jsx";
import { ago } from "../lib/format.js";
import { syncContextFromRoute } from "../lib/syncContext.js";
import QboSyncSheet from "./QboSyncSheet.jsx";

export default function SyncChip({ dark, compact }) {
  // Data only — typing staged edits must not re-render this chip.
  const { syncedAt, eventsSyncedAt, busy, syncProgress, jobs } = useStoreData();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const pct = syncProgress?.pct ?? 0;
  const phase = syncProgress?.label || "Syncing";
  const effectiveJob = (id) => jobs.find((j) => String(j.id) === String(id)) || null;
  const ctx = syncContextFromRoute(loc.pathname, { effectiveJob, jobs });

  const handleClick = () => {
    if (busy) return;
    setOpen(true);
  };

  const idleLabel = syncedAt
    ? eventsSyncedAt
      ? "QBO " + ago(syncedAt) + " · Cal " + ago(eventsSyncedAt)
      : "QBO " + ago(syncedAt)
    : "Sync";

  if (compact) {
    return (
      <>
        <button
          onClick={handleClick}
          disabled={busy}
          data-testid="sync-chip"
          title={busy ? "Syncing…" : "QuickBooks sync — choose what to pull"}
          className={`inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold transition-all ${
            dark
              ? "border-white/30 bg-white/10 text-white px-2.5 py-1"
              : busy
                ? "border-slate-200 bg-white text-slate-700 px-2 py-1 min-w-[5.5rem]"
                : "border-slate-200 bg-slate-50 text-slate-600 px-2.5 py-1 hover:bg-white hover:border-slate-300"
          }`}
        >
          {busy ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wide truncate max-w-[4.5rem]" data-testid="sync-phase-label">
                {phase}
              </span>
              <span className="text-[9px] tabular-nums opacity-70">{pct}%</span>
            </>
          ) : (
            <>
              <span className="text-[10px] leading-none opacity-80" aria-hidden>
                ↻
              </span>
              <span className="whitespace-nowrap">{idleLabel}</span>
            </>
          )}
        </button>
        {open ? (
          <QboSyncSheet
            job={ctx.job}
            customerJobs={ctx.customerJobs}
            contextLabel={ctx.label}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={busy}
        data-testid="sync-chip"
        title={busy ? "Syncing…" : "QuickBooks sync — choose what to pull"}
        className={`flex flex-col rounded-2xl border text-left transition-all duration-300 ${
          busy ? "min-w-[8.75rem] max-w-[10.5rem] px-2.5 py-1.5 gap-1 cursor-wait" : "min-w-[5.25rem] px-3 py-1.5"
        } ${
          dark
            ? "bg-white/15 border-white/25 text-white"
            : busy
              ? "bg-white border-slate-200 text-slate-700"
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
        }`}
      >
        {busy ? (
          <>
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[10px] font-extrabold uppercase tracking-wide" data-testid="sync-phase-label">
                {phase}
              </span>
              <span className="text-[9px] font-semibold tabular-nums opacity-70 shrink-0">{pct}%</span>
            </div>
            <div
              className={`h-1.5 w-full rounded-full overflow-hidden ${dark ? "bg-white/20" : "bg-slate-200/80"}`}
              data-testid="sync-progress-bar"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  dark ? "bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400" : "bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500"
                }`}
                style={{ width: Math.max(6, pct) + "%" }}
                data-testid="sync-battery-fill"
              />
            </div>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {idleLabel}
          </span>
        )}
      </button>
      {open ? (
        <QboSyncSheet
          job={ctx.job}
          customerJobs={ctx.customerJobs}
          contextLabel={ctx.label}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}