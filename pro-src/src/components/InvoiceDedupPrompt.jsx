// Duplicate invoice # prompt — side-by-side compare, then remove or keep separate.
import React, { useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import SideBySideCompare from "./SideBySideCompare.jsx";
import {
  dismissInvoicePair,
  findDuplicateInvoiceSuggestion,
  invoiceCompareRows,
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

  const rows = useMemo(
    () => (sug ? invoiceCompareRows(sug.a.job, sug.b.job, jobs) : []),
    [sug, jobs]
  );

  if (!sug) return null;

  const keepSeparate = () => {
    dismissInvoicePair(sug.invoiceNo, sug.a.job.id, sug.b.job.id);
    setTick((t) => t + 1);
    showToast("Got it — separate invoices");
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
      className="fixed z-40 inset-x-3 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[440px] card border-rose-200 bg-rose-50 shadow-2xl px-4 py-3.5"
      data-testid="invoice-dedup-prompt"
      role="dialog"
      aria-label="Duplicate invoice?"
    >
      <div className="font-bold text-slate-900 text-sm">Duplicate invoice #{sug.invoiceNo}?</div>
      <p className="text-sm text-slate-600 mt-1">
        Compare both jobs side by side — remove the extra row or keep them as separate invoices.
      </p>
      <div className="mt-2">
        <SideBySideCompare
          leftTitle="Job A"
          rightTitle="Job B"
          rows={rows}
          testId="invoice-dedup-compare"
        />
        {sug.extra > 0 ? (
          <div className="text-[11px] text-slate-500 mt-1.5">
            +{sug.extra} more job{sug.extra === 1 ? "" : "s"} with this invoice #
          </div>
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
          onClick={keepSeparate}
          data-testid="invoice-dedup-separate"
        >
          <span className="block text-sm font-bold text-slate-900">Separate invoices</span>
          <span className="block text-xs text-slate-500 mt-0.5">Keep both — won't ask about this pair again</span>
        </button>
      </div>
    </div>
  );
}