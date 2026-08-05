// Sticky staged-changes bar — appears whenever edits are pending.
// Show jobs-with-edits (not leaf-field count) so one Paperwork toggle doesn't
// look like "145 unsaved changes" (Levi 2026-08-05).
import React from "react";
import { useStoreEdit } from "../state/store.jsx";

export default function SaveBar() {
  const { dirtyCount, dirtyJobs, saving, saveAll, discardAll } = useStoreEdit();
  if (!dirtyCount) return null;
  const n = dirtyJobs > 0 ? dirtyJobs : 1;
  return (
    <div className="fixed z-40 inset-x-0 bottom-16 lg:bottom-4 lg:left-60 pb-safe" data-testid="savebar">
      <div className="max-w-3xl mx-auto px-4 pb-2">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-xl">
          <span className="text-sm font-medium flex-1" data-testid="savebar-label">
            Unsaved on <b className="text-amber-400">{n}</b> job{n === 1 ? "" : "s"}
          </span>
          <button
            className="btn text-slate-300 border border-slate-600 !py-2"
            onClick={discardAll}
            disabled={saving}
          >
            Discard
          </button>
          <button
            className="btn bg-emerald-500 text-white !py-2"
            onClick={saveAll}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
