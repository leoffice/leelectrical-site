// Per-job summary — awareness bubbles under title, then service address + doc tabs.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { amountPaid, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { fmt$ } from "../lib/format.js";
import { bubbleStyle, jobAwarenessBubbles } from "../lib/jobAwareness.js";
import JobDocTabs from "./JobDocTabs.jsx";

const BUBBLE_LAYOUT =
  "inline-flex items-center gap-1 rounded-2xl border px-2 py-1 text-[10px] leading-tight lg:rounded-full lg:px-2.5 lg:py-1 lg:text-xs";

function stopBubble(e) {
  e.stopPropagation();
}

function AwarenessBubble({ bubble, onClick }) {
  const pillClass = bubbleStyle(bubble.tone);
  const inner = (
    <>
      <span className="font-extrabold uppercase tracking-wide shrink-0 opacity-90">{bubble.branchLabel}</span>
      <span className="font-bold uppercase tracking-wide shrink-0 opacity-60">{bubble.timing}</span>
      <span className="font-semibold truncate min-w-0 opacity-90">{bubble.upNext}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className={`${BUBBLE_LAYOUT} ${pillClass} max-w-full`} data-testid={"awareness-pill-" + bubble.key}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${BUBBLE_LAYOUT} active:opacity-80 ${pillClass} max-w-full`}
      data-testid={"awareness-pill-" + bubble.key}
      onClick={(e) => {
        stopBubble(e);
        onClick(bubble);
      }}
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
  collapsible = false,
  expanded = true,
  onToggle,
}) {
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = effectiveServiceAddress(job);
  const bubbles = useMemo(() => jobAwarenessBubbles(job, events, commands), [job, events, commands]);
  const showBody = !collapsible || expanded;

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
    <div
      className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 w-full auto-rows-fr"
      data-testid="awareness-bubbles"
      onClick={stopBubble}
    >
      {bubbles.map((b) => (
        <AwarenessBubble key={b.key} bubble={b} onClick={onBubbleTap} />
      ))}
    </div>
  ) : null;

  return (
    <div
      className={`card px-3 py-3 lg:px-4 lg:py-4 ${collapsible ? "cursor-pointer active:bg-slate-50/80" : ""} ${
        collapsible && !expanded ? "ring-1 ring-transparent hover:ring-slate-200" : ""
      }`}
      data-testid="job-info-card"
      data-expanded={collapsible ? (expanded ? "true" : "false") : undefined}
      onClick={collapsible && onToggle ? onToggle : undefined}
      role={collapsible ? "button" : undefined}
      aria-expanded={collapsible ? expanded : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Job information</h3>
          <div className="font-semibold text-sm text-slate-800 break-words leading-snug lg:text-base">
            {job.title || (job.invoiceNo ? "Invoice #" + job.invoiceNo : "Job")}
          </div>
        </div>
        <div onClick={stopBubble}>
          <AmountDisplay job={job} size="sm" highlightDue label="Total due" />
        </div>
      </div>

      {bubbleStrip}

      {collapsible && !expanded ? (
        <p className="text-[10px] text-slate-400 mt-2 text-center">Tap card to expand billing &amp; actions</p>
      ) : null}

      {showBody && rows.length > 0 && (
        <dl className="mt-2 space-y-1 text-xs lg:text-sm min-w-0 w-full">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <dt className="font-semibold text-slate-800 shrink-0 w-[5.5rem] lg:w-32">{k}</dt>
              <dd className="text-slate-500 break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {showBody && onEstimate && onInvoice && onCalendar ? (
        <div onClick={stopBubble}>
          <JobDocTabs
            job={job}
            events={events}
            commands={commands}
            onEstimate={onEstimate}
            onInvoice={onInvoice}
            onPayment={onPayment}
            onCalendar={onCalendar}
          />
        </div>
      ) : null}

      {showBody && showOpenLink && onOpen ? (
        <button
          type="button"
          className="w-full mt-2.5 text-sm font-semibold text-brand text-left"
          onClick={(e) => {
            stopBubble(e);
            onOpen();
          }}
          data-testid="customer-job-row"
        >
          Open full job ›
        </button>
      ) : null}
    </div>
  );
}