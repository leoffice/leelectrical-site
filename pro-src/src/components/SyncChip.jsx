// Header sync chip — tap = full sync; expands with step list + charge bar while busy.
import React from "react";
import { useStore } from "../state/store.jsx";
import { ago } from "../lib/format.js";

export default function SyncChip({ dark }) {
  const { syncedAt, busy, syncNow, syncProgress } = useStore();
  const pct = syncProgress?.pct ?? (busy ? 8 : 0);
  const steps = syncProgress?.steps || [];

  return (
    <div className="relative" data-testid="sync-chip-wrap">
      <button
        onClick={syncNow}
        disabled={busy}
        data-testid="sync-chip"
        className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border min-w-[5.5rem] ${
          dark
            ? "bg-white/15 border-white/25 text-white"
            : busy
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-white border-slate-200 text-slate-500"
        }`}
      >
        <span className="relative flex h-2.5 w-4 shrink-0 rounded-sm border border-slate-300 bg-slate-100 overflow-hidden">
          <span
            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
              busy ? "bg-amber-400" : "bg-emerald-500"
            }`}
            style={{ width: (busy ? Math.max(12, pct) : 100) + "%" }}
            data-testid="sync-battery-fill"
          />
        </span>
        {busy ? "Syncing…" : syncedAt ? `QBO ${ago(syncedAt)}` : "local"}
      </button>

      {busy && steps.length ? (
        <div
          className={`absolute top-full right-0 mt-1.5 z-50 w-44 rounded-xl border shadow-lg px-3 py-2.5 ${
            dark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-700"
          }`}
          data-testid="sync-progress-panel"
        >
          {steps.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] py-0.5">
              <span className="w-3 text-center shrink-0">
                {s.done ? "✓" : s.active ? "●" : "○"}
              </span>
              <span className={s.active ? "font-bold" : s.done ? "opacity-70" : "opacity-50"}>{s.label}</span>
            </div>
          ))}
          <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: pct + "%" }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}