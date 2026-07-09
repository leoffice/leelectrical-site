// Estimate / Invoice / Payment / Calendar tabs below job info.
import React, { useMemo } from "react";
import { jobCalendarLinkState } from "../lib/calendarLink.js";
import { docSyncPendingForJob } from "../lib/docSync.js";
import { hasPendingInvoiceReview } from "../lib/invoiceAgentDraft.js";

function tabTone(active, pending) {
  if (pending) return "bg-amber-50 text-amber-800 border-amber-200";
  if (active) return "bg-brand-soft text-brand border-brand/30";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

export default function JobDocTabs({
  job,
  events,
  commands,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
}) {
  const hasEst = !!(job.estimateNo || job._estimateConfirmed);
  const hasInv = !!(job.invoiceNo || job._invoiceConfirmed);
  const agentReview = hasPendingInvoiceReview(job);
  const canPay = !!(job.invoiceNo || job.amount) && !job.paid;

  const pending = useMemo(() => {
    const syncing = docSyncPendingForJob(commands, job.id);
    return { estimate: syncing, invoice: syncing };
  }, [commands, job.id]);

  const estLabel = hasEst ? "Est " + job.estimateNo : pending.estimate ? "Est…" : "Estimate";
  const invLabel = hasInv ? "Inv " + job.invoiceNo : pending.invoice ? "Inv…" : "Invoice";
  const cal = useMemo(() => jobCalendarLinkState(job, events, commands), [job, events, commands]);
  const calTone = cal.confirmed
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : cal.pending
    ? "bg-orange-50 text-orange-800 border-orange-200"
    : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="grid grid-cols-4 gap-1.5 mt-3" data-testid="job-doc-tabs">
      <button
        type="button"
        className={`rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight ${tabTone(hasEst, pending.estimate)}`}
        onClick={onEstimate}
        data-testid="tab-estimate"
      >
        📝 {estLabel}
      </button>
      <button
        type="button"
        className={`rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight ${
          agentReview
            ? "bg-red-50 text-red-600 border-red-300 animate-pulse"
            : tabTone(hasInv, pending.invoice)
        }`}
        onClick={onInvoice}
        data-testid="tab-invoice"
        aria-label={agentReview ? "Invoice — agent edits awaiting review" : "Invoice"}
      >
        🧾 {agentReview ? "Review" : invLabel}
      </button>
      <button
        type="button"
        className={`rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight ${
          canPay ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"
        }`}
        onClick={onPayment}
        disabled={!canPay && !job.invoiceNo}
        data-testid="tab-payment"
      >
        💳 Payment
      </button>
      <button
        type="button"
        className={`rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight ${calTone}`}
        onClick={onCalendar}
        data-testid="tab-calendar"
      >
        📅 Calendar
      </button>
    </div>
  );
}