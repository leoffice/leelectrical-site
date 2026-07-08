// Estimate / Invoice / Calendar tabs below job info — gray until confirmed in QBO.
import React, { useMemo } from "react";

function tabTone(active, pending) {
  if (pending) return "bg-amber-50 text-amber-800 border-amber-200";
  if (active) return "bg-brand-soft text-brand border-brand/30";
  return "bg-slate-50 text-slate-400 border-slate-200";
}

export default function JobDocTabs({ job, commands, onEstimate, onInvoice, onCalendar }) {
  const hasEst = !!(job.estimateNo || job._estimateConfirmed);
  const hasInv = !!(job.invoiceNo || job._invoiceConfirmed);

  const pending = useMemo(() => {
    const mine = (commands || []).filter((c) => String(c.jobId) === String(job.id));
    return {
      estimate: mine.some((c) => c.type === "create_estimate" && (c.status === "queued" || c.status === "working")),
      invoice: mine.some((c) => c.type === "create_invoice" && (c.status === "queued" || c.status === "working")),
    };
  }, [commands, job.id]);

  const estLabel = hasEst ? "Estimate " + job.estimateNo : pending.estimate ? "Estimate…" : "Estimate";
  const invLabel = hasInv ? "Invoice " + job.invoiceNo : pending.invoice ? "Invoice…" : "Invoice";

  return (
    <div className="flex gap-1.5 mt-3" data-testid="job-doc-tabs">
      <button
        type="button"
        className={`flex-1 rounded-xl border px-2 py-2 text-center text-[11px] font-bold leading-tight ${tabTone(hasEst, pending.estimate)}`}
        onClick={onEstimate}
        data-testid="tab-estimate"
      >
        📝 {estLabel}
      </button>
      <button
        type="button"
        className={`flex-1 rounded-xl border px-2 py-2 text-center text-[11px] font-bold leading-tight ${tabTone(hasInv, pending.invoice)}`}
        onClick={onInvoice}
        data-testid="tab-invoice"
      >
        🧾 {invLabel}
      </button>
      <button
        type="button"
        className="flex-1 rounded-xl border px-2 py-2 text-center text-[11px] font-bold leading-tight bg-slate-50 text-slate-600 border-slate-200"
        onClick={onCalendar}
        data-testid="tab-calendar"
      >
        📅 Calendar
      </button>
    </div>
  );
}