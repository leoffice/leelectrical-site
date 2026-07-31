// Estimate / Invoice / Payment / Calendar / Change Orders tabs below job info.
import React, { useMemo } from "react";
import { jobCalendarLinkState } from "../lib/calendarLink.js";
import { docSyncFailedForJob, docSyncPendingForJob } from "../lib/docSync.js";
import { hasEstimateDraft, hasEstimateOnJob, hasInvoiceDraft, hasInvoiceOnJob } from "../lib/docDraft.js";
import { hasPendingInvoiceReview } from "../lib/invoiceAgentDraft.js";
import { changeOrderTabRows } from "../lib/changeOrder.js";

function tabTone(active, pending, failed) {
  if (pending) return "bg-amber-50 text-amber-800 border-amber-200";
  if (failed) return "bg-red-50 text-red-700 border-red-200";
  if (active) return "bg-brand-soft text-brand border-brand/30";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

export default function JobDocTabs({
  job,
  jobs,
  events,
  commands,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  onChangeOrders,
  changeOrdersActive = false,
  /** A295 — Generate Statement on the job (same flow as customer). */
  onStatement,
}) {
  const hasEst = hasEstimateOnJob(job);
  const hasInv = hasInvoiceOnJob(job);
  const estDraft = hasEstimateDraft(job);
  const invDraft = hasInvoiceDraft(job);
  const agentReview = hasPendingInvoiceReview(job);
  const canPay = !!(job.invoiceNo || job.amount) && !job.paid;
  const coRows = useMemo(() => changeOrderTabRows(jobs || [job], job), [jobs, job]);
  const coCount = coRows.length;

  const pending = useMemo(() => {
    const syncing = docSyncPendingForJob(commands, job.id);
    return { estimate: syncing, invoice: syncing };
  }, [commands, job.id]);

  const failed = useMemo(
    () => ({
      estimate: docSyncFailedForJob(commands, job.id, "estimate", job),
      invoice: docSyncFailedForJob(commands, job.id, "invoice", job),
    }),
    [commands, job, job.id]
  );

  const estLabel = job.estimateNo
    ? "Est " + job.estimateNo
    : estDraft
    ? "Est draft"
    : pending.estimate
    ? "Est…"
    : failed.estimate
    ? "Est!"
    : "Estimate";
  const invLabel = job.invoiceNo
    ? "Inv " + job.invoiceNo
    : invDraft
    ? "Inv draft"
    : pending.invoice
    ? "Inv…"
    : failed.invoice
    ? "Inv!"
    : "Invoice";
  const cal = useMemo(() => jobCalendarLinkState(job, events, commands), [job, events, commands]);
  const calTone = cal.confirmed
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : cal.pending
    ? "bg-orange-50 text-orange-800 border-orange-200"
    : "bg-red-50 text-red-700 border-red-200";
  // Bottom CO tab only when history already has change orders (create is header "Add change order").
  const showCoTab = coCount > 0;
  // Show the actual document numbers, not just a count (Levi 2026-07-28) — the
  // point of the row is telling you WHICH estimate/invoice each button opens.
  const coNos = coRows
    .map((r) => String(r.docNo || "").trim())
    .filter(Boolean);
  const coLabel =
    coNos.length && coNos.length <= 3 ? "COs " + coNos.join(" · ") : "COs · " + coCount;

  // text-xs matches Job information body (Levi: Est/Inv/Payment labels were too small).
  const tabClass =
    "rounded-xl border px-1 py-2 text-center text-xs font-bold leading-tight break-words";

  return (
    <div className="mt-3 space-y-1" data-testid="job-doc-tabs">
      <div className={`grid gap-1 ${showCoTab ? "grid-cols-5" : "grid-cols-4"}`}>
        <button
          type="button"
          className={`${tabClass} ${tabTone(hasEst, pending.estimate, failed.estimate)}`}
          onClick={onEstimate}
          data-testid="tab-estimate"
        >
          📝 {estLabel}
        </button>
        <button
          type="button"
          className={`${tabClass} ${
            agentReview
              ? "bg-red-50 text-red-600 border-red-300 animate-pulse"
              : tabTone(hasInv, pending.invoice, failed.invoice)
          }`}
          onClick={onInvoice}
          data-testid="tab-invoice"
          aria-label={agentReview ? "Invoice — agent edits awaiting review" : "Invoice"}
        >
          🧾 {agentReview ? "Review" : invLabel}
        </button>
        <button
          type="button"
          className={`${tabClass} ${
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
          className={`${tabClass} ${calTone}`}
          onClick={onCalendar}
          data-testid="tab-calendar"
        >
          📅 Calendar
        </button>
        {showCoTab ? (
          <button
            type="button"
            className={`${tabClass} ${
              changeOrdersActive
                ? "bg-brand-soft text-brand border-brand/30"
                : "bg-violet-50 text-violet-800 border-violet-200"
            }`}
            onClick={onChangeOrders}
            data-testid="tab-change-orders"
            title="Show change orders on this job"
          >
            📋 {coLabel}
          </button>
        ) : null}
      </div>
      {onStatement ? (
        <button
          type="button"
          className="w-full rounded-xl border border-dashed border-brand/40 bg-brand-soft/50 px-2 py-2 text-center text-[10px] font-bold text-brand active:opacity-80"
          onClick={onStatement}
          data-testid="tab-statement"
        >
          🧾 Generate Statement
        </button>
      ) : null}
    </div>
  );
}
