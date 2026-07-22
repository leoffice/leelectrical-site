// Watches the command bus for needs_approval commands (customer_sync etc.)
// and shows a draggable panel so you can compare LE Pro vs QuickBooks.
import React, { useEffect, useRef, useState } from "react";
import FloatingPanel from "./FloatingPanel.jsx";
import { Opt } from "./Sheet.jsx";
import { useStoreData } from "../state/store.jsx";
import { customerSyncPayload, qboCustomerToJobPatch } from "../lib/customerSync.js";
import { productName } from "../lib/tenantBranding.js";
import { useTenantConfig } from "../state/tenant.jsx";

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  addr: "Billing address",
};

function fieldRows(proposed, qboCustomer, diffs) {
  const keys = diffs ? Object.keys(diffs) : ["name", "email", "phone", "addr"];
  return keys.map((k) => ({
    key: k,
    label: FIELD_LABELS[k] || k,
    app: proposed?.[k] ?? proposed?.[k === "addr" ? "billingAddr" : k] ?? "—",
    qbo: qboCustomer?.[k] ?? qboCustomer?.[k === "addr" ? "billingAddress" : k] ?? "—",
    changed: Boolean(diffs?.[k]),
  }));
}

export default function ApprovalWatcher() {
  const { commands, resolveApproval, enqueue, showToast, effectiveJob } = useStoreData();
  const product = productName(useTenantConfig());
  const seen = useRef({});
  const [cmd, setCmd] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (cmd) return;
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
  const proposed = r.proposed || p || {};
  const qboCustomer = r.customer || {};
  const isUpdateConflict = r.action === "recommend_update" && qboCustomer.id;
  const upd =
    isUpdateConflict
      ? { id: qboCustomer.id, name: qboCustomer.name || "" }
      : r.recommend === "update" && r.matchId
        ? { id: r.matchId, name: "" }
        : null;
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
      { ...customerSyncPayload(j), search: s },
      "deterministic",
      "custsync:" + cmd.jobId + ":" + Date.now()
    );
    showToast(`Searching QuickBooks for “${s}”…`);
  };

  const rows = isUpdateConflict ? fieldRows(proposed, qboCustomer, r.diffs) : [];

  return (
    <FloatingPanel title="QuickBooks needs your OK" onClose={close} testId="customer-sync-approval">
      <p className="text-sm text-slate-500 mb-3">
        {isUpdateConflict
          ? `${product} and QuickBooks disagree. Drag this panel aside, check the job, then pick which side is correct.`
          : r.message || `For ${p.name || "customer"}: ${r.reason || "choose how to sync."}`}
      </p>

      {rows.length > 0 && (
        <div className="text-xs border border-slate-200 rounded-xl overflow-hidden mb-3">
          <div className="grid grid-cols-3 gap-1 bg-slate-50 px-2 py-1.5 font-bold uppercase tracking-wide text-[10px] text-slate-400">
            <span>Field</span>
            <span>{product}</span>
            <span>QuickBooks</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className={`grid grid-cols-3 gap-1 px-2 py-1.5 border-t border-slate-100 ${row.changed ? "bg-amber-50/80" : ""}`}
            >
              <span className="font-semibold text-slate-600">{row.label}</span>
              <span className={row.changed ? "font-semibold text-brand" : "text-slate-700"}>{String(row.app)}</span>
              <span className={row.changed ? "font-semibold text-emerald-700" : "text-slate-700"}>{String(row.qbo)}</span>
            </div>
          ))}
        </div>
      )}

      {(r.diff || r.diffs) && !isUpdateConflict && (
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 whitespace-pre-wrap">
          <b className="block uppercase tracking-wide text-slate-400 text-[10px] mb-1">Proposed changes</b>
          {r.diffs
            ? Object.entries(r.diffs).map(([k, v]) => (
                <div key={k}>
                  <b>{k}:</b>{" "}
                  <span className="line-through text-slate-400">{(r.customer || {})[k] || "—"}</span>{" "}
                  → <span className="font-semibold text-emerald-700">{String(v)}</span>
                </div>
              ))
            : typeof r.diff === "string"
              ? r.diff
              : JSON.stringify(r.diff, null, 1)}
        </div>
      )}

      {isUpdateConflict && upd && (
        <>
          <Opt
            icon="📲"
            title={`${product} is correct → Update QuickBooks`}
            note="Push your edits in the app to the QuickBooks customer"
            onClick={() => resolve("update", upd.id)}
          />
          <Opt
            icon="📥"
            title={`QuickBooks is correct → Update ${product}`}
            note="Replace this job's customer info with what's in QuickBooks"
            onClick={() => resolve("pull_qbo", upd.id)}
          />
        </>
      )}

      {(r.candidates || []).length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
            Possible QuickBooks matches
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

      {!isUpdateConflict && upd && (
        <Opt
          icon="🔄"
          title={"Update QuickBooks — " + (upd.name || "existing customer")}
          note="Apply the new info in QuickBooks"
          onClick={() => resolve("update", upd.id)}
        />
      )}

      <div className="flex gap-2 mb-3">
        <input
          className="input flex-1"
          placeholder="Not it? Search QuickBooks by name/address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Refine search"
        />
        <button type="button" className="btn bg-brand-soft text-brand shrink-0" onClick={refine}>
          Search
        </button>
      </div>

      <Opt icon="➕" title="Create new customer in QuickBooks" note="No match — add as new" onClick={() => resolve("create", "")} />
      <Opt icon="✋" title="Skip for now" onClick={() => resolve("skip", "")} />
      <p className="text-[10px] text-slate-400 text-center mt-2">Drag the ⠿ bar to move this panel</p>
    </FloatingPanel>
  );
}