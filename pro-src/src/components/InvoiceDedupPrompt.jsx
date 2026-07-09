// Duplicate invoice # prompt — offers to delete the extra job row.
import React, { useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  dismissInvoicePair,
  findDuplicateInvoiceSuggestion,
  pickKeeperJob,
} from "../lib/invoiceDedup.js";

export default function InvoiceDedupPrompt() {
  const { jobs, loading, patchAndSave, showToast } = useStore();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const sug = useMemo(
    () => (loading ? null : findDuplicateInvoiceSuggestion(jobs)),
    [jobs, loading, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!sug) return null;

  const keepBoth = () => {
    dismissInvoicePair(sug.invoiceNo, sug.a.job.id, sug.b.job.id);
    setTick((t) => t + 1);
    showToast("Got it — keeping both jobs");
  };

  const merge = async () => {
    if (busy) return;
    setBusy(true);
    const keeper = pickKeeperJob(sug.a.job, sug.b.job);
    const drop = keeper.id === sug.a.job.id ? sug.b.job : sug.a.job;
    await patchAndSave(drop.id, { _deleted: true });
    dismissInvoicePair(sug.invoiceNo, sug.a.job.id, sug.b.job.id);
    setBusy(false);
    setTick((t) => t + 1);
    showToast("Removed duplicate — kept " + (keeper.title || keeper.customer || keeper.id));
  };

  return (
    <div
      className="fixed z-40 inset-x-3 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[400px] card border-rose-200 bg-rose-50 shadow-2xl px-4 py-3.5"
      data-testid="invoice-dedup-prompt"
      role="dialog"
      aria-label="Duplicate invoice?"
    >
      <div className="font-bold text-slate-900 text-sm">Duplicate invoice #{sug.invoiceNo}?</div>
      <p className="text-sm text-slate-600 mt-1">
        Two jobs share this invoice number. Remove the extra row or keep both if they are legitimately separate.
      </p>
      <div className="mt-2 text-xs text-slate-600 space-y-1.5 bg-white/70 rounded-xl px-3 py-2 border border-rose-100">
        <div>
          <span className="font-bold text-slate-700">A:</span> {sug.a.summary}
        </div>
        <div>
          <span className="font-bold text-slate-700">B:</span> {sug.b.summary}
        </div>
        {sug.extra > 0 ? (
          <div className="text-slate-500">+{sug.extra} more job{sug.extra === 1 ? "" : "s"} with this invoice #</div>
        ) : null}
      </div>
      <div className="mt-2.5 space-y-2">
        <button
          type="button"
          className="w-full text-left border border-brand/30 bg-brand rounded-xl px-3 py-2.5 text-white disabled:opacity-60 active:opacity-90"
          onClick={merge}
          disabled={busy}
          data-testid="invoice-dedup-merge"
        >
          <span className="block text-sm font-bold">Remove duplicate</span>
          <span className="block text-xs text-white/85 mt-0.5">Keeps the job with more payment/QBO data</span>
        </button>
        <button
          type="button"
          className="w-full text-left border border-slate-200 bg-white rounded-xl px-3 py-2.5 active:bg-slate-50"
          onClick={keepBoth}
          data-testid="invoice-dedup-keep"
        >
          <span className="block text-sm font-bold text-slate-900">Keep both</span>
          <span className="block text-xs text-slate-500 mt-0.5">Won't ask about this pair again</span>
        </button>
      </div>
    </div>
  );
}