// QuickBooks sync menu — pick what to pull, confirm, then sync (context-aware).
import React, { useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "./Sheet.jsx";
import { runQboSync } from "../lib/qboSyncActions.js";

const KINDS = [
  { id: "refresh", icon: "📅", title: "Refresh calendar & jobs", note: "Update calendar and local data", global: true },
  { id: "customer", icon: "👤", title: "Customer info", note: "Name, phone, email, billing address" },
  { id: "invoices", icon: "🧾", title: "Invoices", note: "Pull invoice jobs from QuickBooks", sub: true },
  { id: "estimates", icon: "📝", title: "Estimates", note: "Refresh estimate jobs on file", sub: true },
  { id: "payments", icon: "💳", title: "Payments", note: "Pull payment history per invoice", sub: true },
  { id: "history", icon: "📚", title: "Full history", note: "Customer + all invoices + all payments" },
];

export default function QboSyncSheet({ job, customerJobs, contextLabel, onClose }) {
  const { enqueue, showToast, refreshJobs, api, syncNow } = useStore();
  const [kind, setKind] = useState(null);
  const [scope, setScope] = useState("open");
  const hasContext = Boolean(job);

  const selected = KINDS.find((k) => k.id === kind);
  const needsScope = selected?.sub;
  const canConfirm = kind && (selected?.global || hasContext) && (!needsScope || scope);

  const run = async () => {
    if (!canConfirm) return;
    onClose();
    if (kind === "refresh") {
      await syncNow();
      return;
    }
    await runQboSync({
      kind,
      scope,
      job,
      customerJobs,
      enqueue,
      showToast,
      refreshJobs,
      api,
    });
  };

  return (
    <Sheet title="QuickBooks sync" onClose={onClose}>
      {contextLabel ? (
        <p className="text-xs text-brand font-semibold mb-2" data-testid="qbo-sync-context">
          Syncing for {contextLabel}
        </p>
      ) : (
        <p className="text-xs text-slate-500 mb-2">Choose what to refresh. Open a customer or job for scoped QuickBooks pulls.</p>
      )}
      {KINDS.map((k) => {
        const disabled = !k.global && !hasContext;
        const active = kind === k.id;
        return (
          <Opt
            key={k.id}
            icon={k.icon}
            title={k.title}
            note={disabled ? "Open a customer or job first" : k.note}
            onClick={() => !disabled && setKind(k.id)}
            className={active ? "ring-2 ring-brand/40 bg-brand-soft/50" : disabled ? "opacity-50" : ""}
            data-testid={"qbo-sync-" + k.id}
          />
        );
      })}
      {needsScope && hasContext ? (
        <div className="mt-2 flex gap-2" data-testid="qbo-sync-scope">
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
              scope === "all" ? "border-brand bg-brand-soft text-brand" : "border-slate-200 text-slate-600"
            }`}
            onClick={() => setScope("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
              scope === "open" ? "border-brand bg-brand-soft text-brand" : "border-slate-200 text-slate-600"
            }`}
            onClick={() => setScope("open")}
          >
            Open only
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="btn bg-brand text-white w-full mt-3"
        disabled={!canConfirm}
        onClick={run}
        data-testid="qbo-sync-confirm"
      >
        Confirm & sync
      </button>
    </Sheet>
  );
}