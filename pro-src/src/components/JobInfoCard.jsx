// Per-job summary — service address, amounts, linked appointment.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { PaidPill, StagePill } from "./JobCard.jsx";
import { amountPaid, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { eventForJob } from "../lib/calendarLink.js";
import { evStart, fmt$ } from "../lib/format.js";
import JobDocTabs from "./JobDocTabs.jsx";

function LinkedAppointmentButton({ job, event, onLink }) {
  if (job.calEventId && event) {
    const when = evStart(event).replace("T", " ").slice(0, 16);
    return (
      <button
        type="button"
        className="btn bg-brand-soft text-brand w-full !py-2 !text-xs lg:!text-sm"
        onClick={onLink}
        data-testid="linked-appt-btn"
      >
        🔗 Linked: {event.summary || when}
      </button>
    );
  }
  if (job.calEventId) {
    return (
      <button
        type="button"
        className="btn bg-brand-soft text-brand w-full !py-2 !text-xs lg:!text-sm"
        onClick={onLink}
        data-testid="linked-appt-btn"
      >
        🔗 Linked appointment — tap to manage
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn bg-red-50 text-red-600 border border-red-200 w-full !py-2 !text-xs lg:!text-sm"
      onClick={onLink}
      data-testid="linked-appt-btn"
    >
      🔗 No linked appointment — tap to link
    </button>
  );
}

export default function JobInfoCard({
  job,
  events,
  commands,
  onOpen,
  onLinkAppt,
  onEstimate,
  onInvoice,
  onCalendar,
  showOpenLink = true,
}) {
  const event = useMemo(() => eventForJob(job, events), [job, events]);
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = effectiveServiceAddress(job);

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
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            <StagePill job={job} />
            <PaidPill job={job} />
          </div>
        </div>
        <AmountDisplay job={job} size="sm" />
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

      <div className="mt-3 space-y-2">
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-0.5">Linked appointment</div>
        <LinkedAppointmentButton job={job} event={event} onLink={onLinkAppt} />
      </div>

      {onEstimate && onInvoice && onCalendar ? (
        <JobDocTabs
          job={job}
          commands={commands}
          onEstimate={onEstimate}
          onInvoice={onInvoice}
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