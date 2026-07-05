// Watches the command bus for needs_approval commands (customer_sync etc.)
// and pops the approval sheet: update existing / pick a candidate / create
// new / skip, plus a refine-search box (skip then re-enqueue with search).
import React, { useEffect, useRef, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";

export default function ApprovalWatcher() {
  const { commands, resolveApproval, enqueue, effectiveJob, showToast } = useStore();
  const seen = useRef({});
  const [cmd, setCmd] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (cmd) return; // one at a time
    const next = (commands || []).find((c) => c.status === "needs_approval" && !seen.current[c.id]);
    if (next) {
      seen.current[next.id] = 1;
      setCmd(next);
      setQ("");
    }
  }, [commands, cmd]);

  if (!cmd) return null;
  const r = cmd.result || {};
  const p = cmd.payload || {};
  const close = () => setCmd(null);
  const resolve = (choice, matchId) => {
    close();
    resolveApproval(cmd.id, choice, matchId || "");
  };
  const refine = async () => {
    const s = q.trim();
    if (!s) return showToast("Type a search term");
    close();
    await resolveApproval(cmd.id, "skip", "");
    const j = effectiveJob(cmd.jobId) || {};
    enqueue(
      "customer_sync",
      cmd.jobId,
      { name: j.customer || "", email: j.email || "", phone: j.phone || "", addr: j.address || "", search: s },
      "deterministic",
      "custsync:" + cmd.jobId + ":" + Date.now()
    );
    showToast(`Searching QuickBooks for “${s}”…`);
  };

  return (
    <Sheet title="QuickBooks needs your OK" onClose={close}>
      <p className="text-sm text-slate-500 mb-3">
        {r.message || `For ${p.name || "customer"}: ${r.reason || "choose how to sync."}`}
      </p>
      {r.diff && (
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 whitespace-pre-wrap">
          <b className="block uppercase tracking-wide text-slate-400 text-[10px] mb-1">Proposed changes</b>
          {typeof r.diff === "string" ? r.diff : JSON.stringify(r.diff, null, 1)}
        </div>
      )}
      {(r.candidates || []).length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
            Possible matches
          </div>
          {(r.candidates || []).map((x, i) => (
            <Opt
              key={i}
              icon="👤"
              title={x.name || "?"}
              note={[x.email, x.phone, x.addr || x.address].filter(Boolean).join(" ")}
              onClick={() => resolve("update", x.id || "")}
            />
          ))}
        </>
      )}
      <div className="flex gap-2 mb-3">
        <input
          className="input flex-1"
          placeholder="Not it? Search QuickBooks by name/address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Refine search"
        />
        <button className="btn bg-brand-soft text-brand shrink-0" onClick={refine}>
          Search
        </button>
      </div>
      {r.recommend === "update" && r.matchId && (
        <Opt
          icon="🔄"
          title="Update existing customer"
          note="Apply the new info in QuickBooks"
          onClick={() => resolve("update", r.matchId)}
        />
      )}
      <Opt icon="➕" title="Create new customer" note="Add to QuickBooks as new" onClick={() => resolve("create", "")} />
      <Opt icon="✋" title="Skip for now" onClick={() => resolve("skip", "")} />
    </Sheet>
  );
}
