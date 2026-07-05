// Header sync chip — "QBO Xm ago", pulses while busy, tap = fresh QBO pull.
import React from "react";
import { useStore } from "../state/store.jsx";
import { ago } from "../lib/format.js";

export default function SyncChip({ dark }) {
  const { syncedAt, busy, syncNow } = useStore();
  return (
    <button
      onClick={syncNow}
      data-testid="sync-chip"
      className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border ${
        dark
          ? "bg-white/15 border-white/25 text-white"
          : "bg-white border-slate-200 text-slate-500"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${busy ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}
      />
      {busy ? "Syncing…" : syncedAt ? `QBO ${ago(syncedAt)}` : "local"}
    </button>
  );
}
