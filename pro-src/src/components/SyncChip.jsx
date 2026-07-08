// Header sync chip — widens while syncing; current phase + progress bar inline (no popup).
import React from "react";
import { useStore } from "../state/store.jsx";
import { ago } from "../lib/format.js";

export default function SyncChip({ dark }) {
  const { syncedAt, busy, syncNow, syncProgress } = useStore();
  const pct = syncProgress?.pct ?? 0;
  const phase = syncProgress?.label || "Syncing";

  return (
    <button
      onClick={syncNow}
      data-testid="sync-chip"
      title={busy ? "Tap to skip to next step" : "Sync calendar, QuickBooks, and jobs"}
      className={`flex flex-col rounded-2xl border text-left transition-all duration-200 ${
        busy ? "min-w-[8.75rem] max-w-[10.5rem] px-2.5 py-1.5 gap-1" : "min-w-[5.25rem] px-3 py-1.5"
      } ${
        dark
          ? "bg-white/15 border-white/25 text-white"
          : busy
            ? "bg-amber-50 border-amber-200 text-amber-950"
            : "bg-white border-slate-200 text-slate-500"
      }`}
    >
      {busy ? (
        <>
          <div className="flex items-center justify-between gap-2 w-full">
            <span
              className="text-[10px] font-extrabold uppercase tracking-wide animate-pulse"
              data-testid="sync-phase-label"
            >
              {phase}
            </span>
            <span className="text-[9px] font-semibold tabular-nums opacity-70 shrink-0">{pct}%</span>
          </div>
          <div
            className={`h-1 w-full rounded-full overflow-hidden ${dark ? "bg-white/20" : "bg-amber-200/70"}`}
            data-testid="sync-progress-bar"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${dark ? "bg-white" : "bg-amber-500"}`}
              style={{ width: Math.max(8, pct) + "%" }}
              data-testid="sync-battery-fill"
            />
          </div>
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          {syncedAt ? `QBO ${ago(syncedAt)}` : "local"}
        </span>
      )}
    </button>
  );
}