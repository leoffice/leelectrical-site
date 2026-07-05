// Archive — archived (non-deleted) jobs with restore + view.
import React from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";

export default function Archive() {
  const { jobs, patchAndSave, showToast } = useStore();
  const nav = useNavigate();
  const list = jobs.filter((j) => j._archived && !j._deleted);
  return (
    <div>
      <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 px-1">
        Archived jobs ({list.length})
      </h2>
      {!list.length ? (
        <div className="card px-4 py-10 text-center text-sm text-slate-400">
          <span className="block text-3xl mb-2">📦</span>
          Nothing archived yet.
          <br />
          Finished jobs you archive land here.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((j) => (
            <div key={j.id} className="card px-4 py-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <b className="block truncate">{j.customer || "—"}</b>
                <div className="text-xs text-slate-500 truncate">
                  {j.title || ""} · {fmt$(j.amount)}
                </div>
              </div>
              <button
                className="btn bg-brand-soft text-brand !py-2 shrink-0"
                onClick={() => {
                  patchAndSave(j.id, { _archived: false });
                  showToast("Restored");
                }}
              >
                Restore
              </button>
              <button className="btn-ghost !py-2 shrink-0" onClick={() => nav(`/job/${encodeURIComponent(j.id)}`)}>
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
