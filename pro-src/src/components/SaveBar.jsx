// Sticky staged-changes bar — appears whenever edits are pending.
import React from "react";
import { useStore } from "../state/store.jsx";

export default function SaveBar() {
  const { dirtyCount, saving, saveAll, discardAll } = useStore();
  if (!dirtyCount) return null;
  return (
    <div className="fixed z-40 inset-x-0 bottom-16 lg:bottom-0 lg:left-60 pb-safe">
      <div className="max-w-3xl mx-auto px-4 pb-2">
        <div className="card flex items-center gap-3 px-4 py-3 border-brand/30 shadow-lg">
          <span className="pill bg-accent-soft text-accent">{dirtyCount}</span>
          <span className="text-sm font-medium text-slate-700">
            unsaved change{dirtyCount > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={discardAll} disabled={saving}>
              Discard
            </button>
            <button className="btn-brand" onClick={saveAll} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
