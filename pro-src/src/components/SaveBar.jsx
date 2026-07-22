// Sticky staged-changes bar — appears whenever edits are pending.
import React from "react";
import { useStoreEdit } from "../state/store.jsx";

export default function SaveBar() {
  const { dirtyCount, saving, saveAll, discardAll } = useStoreEdit();
  if (!dirtyCount) return null;
  return (
    <div className="fixed z-40 inset-x-0 bottom-16 lg:bottom-4 lg:left-60 pb-safe" data-testid="savebar">
      <div className="max-w-3xl mx-auto px-4 pb-2">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-xl">
          <span className="text-sm font-medium flex-1">
            <b className="text-amber-400">{dirtyCount}</b> unsaved change{dirtyCount > 1 ? "s" : ""}
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
            {saving ? "Saving…" : "Save & sync"}
          </button>
        </div>
      </div>
    </div>
  );
}
