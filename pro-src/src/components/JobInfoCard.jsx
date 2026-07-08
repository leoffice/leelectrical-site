// Per-job summary — service address, amounts, doc tabs.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { StagePill } from "./JobCard.jsx";
import { amountPaid, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { fmt$ } from "../lib/format.js";
import { PAPERWORK_PILL_STYLES, hasActivePaperwork, paperworkAwarenessLines } from "../lib/paperwork.js";
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
  onPaperworkSchedule,
  showOpenLink = true,
}) {
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = effectiveServiceAddress(job);
  const paperLines = useMemo(() => paperworkAwarenessLines(job, events), [job, events]);
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
          <div className="font-semibold text-sm text-slate-800 break-words leading-snug lg:text-base">
            {job.title || (job.invoiceNo ? "Invoice #" + job.invoiceNo : "Job")}
          </div>
        </div>
        <AmountDisplay job={job} size="sm" highlightDue label="Total due" />
      </div>

      <div className="mt-1.5 flex flex-col gap-1.5 w-full lg:flex-row lg:flex-wrap lg:items-center lg:justify-start">
        {showPaper ? (
          paperLines.map((line) => {
            const { branchKey, branchLabel, upNext, timing, tone, isSchedulable } = line;
            const pillClass = PAPERWORK_PILL_STYLES[tone] || PAPERWORK_PILL_STYLES.slate;
            const inner = (
              <>
                <span className="font-extrabold text-[10px] uppercase tracking-wider shrink-0 opacity-90">{branchLabel}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 opacity-70">{timing}</span>
                <span className="flex-1 min-w-0 leading-snug break-words opacity-90">{upNext}</span>
              </>
            );
            const pillLayout =
              "w-full flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-2xl border px-2.5 py-1.5 text-xs text-left lg:w-auto lg:inline-flex lg:rounded-full lg:py-1";
            if (isSchedulable && onPaperworkSchedule) {
              return (
                <button
                  key={branchKey}
                  type="button"
                  className={`${pillLayout} active:opacity-80 ${pillClass}`}
                  data-testid={"paper-pill-" + branchKey}
                  onClick={() => onPaperworkSchedule(line)}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div key={branchKey} className={`${pillLayout} ${pillClass}`} data-testid={"paper-pill-" + branchKey}>
                {inner}
              </div>
            );
          })
        ) : (
          <StagePill job={job} />
        )}
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