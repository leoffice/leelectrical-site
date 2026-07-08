// Per-job summary — service address, amounts, doc tabs.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { StagePill } from "./JobCard.jsx";
import { amountPaid, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { fmt$ } from "../lib/format.js";
import { hasActivePaperwork, paperworkAwarenessLines } from "../lib/paperwork.js";
import JobDocTabs from "./JobDocTabs.jsx";

export default function JobInfoCard({
  job,
  events,
  commands,
  onOpen,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  showOpenLink = true,
}) {
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = effectiveServiceAddress(job);
  const paperLines = useMemo(() => paperworkAwarenessLines(job), [job]);
  const showPaper = hasActivePaperwork(job);

  const rows = [
    ["Service address", svc],
    job.invoiceNo ? ["Invoice", job.invoiceNo] : null,
    job.estimateNo ? ["Estimate", job.estimateNo] : null,
    total > 0 ? ["Invoice amount", fmt$(total)] : null,
    paid > 0 ? ["Paid", fmt$(paid)] : null,
    !job.paid && balance > 0 ? ["Balance due", fmt$(balance)] : null,
    total > 0 && !job.paid ? ["% paid", pct + "%"] : null,
    job.paid ? ["Status", "Paid in full"] : null,
  ].filter(Boolean);

  return (
    <div className="card px-3 py-3 lg:px-4 lg:py-4" data-testid="job-info-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Job information</h3>
          <div className="font-semibold text-sm text-slate-800 break-words lg:text-base">
            {job.title || (job.invoiceNo ? "Invoice #" + job.invoiceNo : "Job")}
          </div>
          <div className="mt-1.5 flex gap-1.5 flex-wrap items-center justify-start">
            {showPaper ? (
              paperLines.map(({ branchKey, branchLabel, upNext, timing }) => (
                <div
                  key={branchKey}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs max-w-full"
                  data-testid={"paper-pill-" + branchKey}
                >
                  <span className="font-extrabold text-[10px] uppercase tracking-wider text-slate-700 shrink-0">
                    {branchLabel}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{timing}</span>
                  <span className="text-slate-600 leading-snug truncate">{upNext}</span>
                </div>
              ))
            ) : (
              <StagePill job={job} />
            )}
          </div>
        </div>
        <AmountDisplay job={job} size="sm" highlightDue />
      </div>

      {rows.length > 0 && (
        <dl className="mt-3 space-y-1 text-xs lg:text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <dt className="font-semibold text-slate-800 shrink-0 w-[5.5rem] lg:w-32">{k}</dt>
              <dd className="text-slate-500 break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {onEstimate && onInvoice && onCalendar ? (
        <JobDocTabs
          job={job}
          events={events}
          commands={commands}
          onEstimate={onEstimate}
          onInvoice={onInvoice}
          onPayment={onPayment}
          onCalendar={onCalendar}
        />
      ) : null}

      {showOpenLink && onOpen ? (
        <button
          type="button"
          className="w-full mt-2.5 text-sm font-semibold text-brand text-left"
          onClick={onOpen}
          data-testid="customer-job-row"
        >
          Open full job ›
        </button>
      ) : null}
    </div>
  );
}