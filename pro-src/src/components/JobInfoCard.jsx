// Per-job summary — service address, amounts, doc tabs, right-aligned awareness bubbles.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { amountPaid, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { fmt$ } from "../lib/format.js";
import { bubbleStyle, jobAwarenessBubbles } from "../lib/jobAwareness.js";
import JobDocTabs from "./JobDocTabs.jsx";

const BUBBLE_LAYOUT =
  "inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 max-w-full text-left rounded-2xl border px-2.5 py-1.5 text-xs lg:rounded-full lg:py-1";

function AwarenessBubble({ bubble, onClick }) {
  const pillClass = bubbleStyle(bubble.tone);
  const inner = (
    <>
      <span className="font-extrabold text-[10px] uppercase tracking-wider shrink-0 opacity-90">{bubble.branchLabel}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 opacity-70">{bubble.timing}</span>
      <span className="leading-snug break-words text-right max-w-[14rem] lg:max-w-[11rem] opacity-90">{bubble.upNext}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className={`${BUBBLE_LAYOUT} ${pillClass}`} data-testid={"awareness-pill-" + bubble.key}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${BUBBLE_LAYOUT} active:opacity-80 ${pillClass}`}
      data-testid={"awareness-pill-" + bubble.key}
      onClick={() => onClick(bubble)}
    >
      {inner}
    </button>
  );
}

export default function JobInfoCard({
  job,
  events,
  commands,
  onOpen,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  onBubbleTap,
  showOpenLink = true,
}) {
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = effectiveServiceAddress(job);
  const bubbles = useMemo(() => jobAwarenessBubbles(job, events, commands), [job, events, commands]);

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

  const bubbleStrip = bubbles.length ? (
    <div className="flex flex-wrap justify-end gap-1.5 content-start max-h-[3.25rem] overflow-hidden lg:max-h-[2.75rem]" data-testid="awareness-bubbles">
      {bubbles.map((b) => (
        <AwarenessBubble key={b.key} bubble={b} onClick={onBubbleTap} />
      ))}
    </div>
  ) : null;

  const bubbleOverflow = bubbles.length > 2;

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

      {bubbleStrip && !bubbleOverflow ? <div className="mt-1.5 flex justify-end w-full">{bubbleStrip}</div> : null}

      <div className={`mt-2 flex flex-col gap-2 min-w-0 ${bubbleOverflow ? "lg:flex-row lg:items-start lg:gap-3" : ""}`}>
        {rows.length > 0 && (
          <dl className={`space-y-1 text-xs lg:text-sm min-w-0 ${bubbleOverflow ? "flex-1" : "w-full"}`}>
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-2 items-baseline">
                <dt className="font-semibold text-slate-800 shrink-0 w-[5.5rem] lg:w-32">{k}</dt>
                <dd className="text-slate-500 break-words min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {bubbleOverflow ? <div className="flex justify-end shrink-0 lg:max-w-[48%]">{bubbleStrip}</div> : null}
      </div>

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