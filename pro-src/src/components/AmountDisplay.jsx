// Balance due (prominent) + invoiced / paid sub-line (small gray).
import React from "react";
import { amountPaid, fmtAmountDue, invoiceTotal, openBalance, paidPct } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

const SIZE = {
  sm: { main: "font-semibold text-xs text-slate-900", sub: "text-[8px]" },
  md: { main: "font-semibold text-sm text-slate-900", sub: "text-[9px]" },
  lg: { main: "font-bold text-base text-slate-900 lg:text-lg", sub: "text-[9px] lg:text-[10px]" },
};

export function AmountSubline({ job, className = "" }) {
  const total = invoiceTotal(job);
  if (!total) return null;
  const paid = amountPaid(job);
  const pct = paidPct(job);
  if (job.paid) {
    return <div className={`text-slate-400 leading-tight mt-0.5 ${className}`}>{fmt$(total)} invoiced</div>;
  }
  const paidPart = paid > 0 ? ` · ${fmt$(paid)} paid (${pct}%)` : "";
  return (
    <div className={`text-slate-400 leading-tight mt-0.5 ${className}`}>
      {fmt$(total)} invoiced{paidPart}
    </div>
  );
}

export function CustomerAmountSubline({ invoiced, paid, openInvoices, className = "" }) {
  if (!invoiced) return null;
  const pct = invoiced > 0 ? Math.min(100, Math.round((paid / invoiced) * 100)) : 0;
  const invLabel = openInvoices === 1 ? "1 open invoice" : openInvoices + " open invoices";
  const paidPart = paid > 0 ? ` · ${fmt$(paid)} paid (${pct}%)` : "";
  return (
    <div className={`text-slate-400 leading-tight mt-0.5 ${className}`}>
      {fmt$(invoiced)} invoiced{paidPart}
      {openInvoices > 0 ? ` · ${invLabel}` : ""}
    </div>
  );
}

export default function AmountDisplay({ job, size = "md", showSub = true, highlightDue = false, label = "" }) {
  const s = SIZE[size] || SIZE.md;
  const main = fmtAmountDue(job) || "—";
  const due = job ? openBalance(job) : 0;
  const showDueStack = highlightDue && label;
  const showDueRing = showDueStack && job && !job.paid && due > 0.01;
  const hideSub = showDueStack;
  return (
    <div
      className={`text-right shrink-0 ${showDueStack ? "max-w-[42%] sm:max-w-[38%] lg:max-w-none" : "max-w-[46%] lg:max-w-none"}`}
      data-testid="amount-display"
    >
      {showDueStack ? (
        <div className="flex flex-col items-end gap-0.5">
          <div
            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none whitespace-nowrap ${
              showDueRing ? "border-slate-200 bg-slate-100/90" : "border-transparent"
            }`}
          >
            {label}
          </div>
          <div className={`${s.main} tabular-nums leading-tight`}>{main}</div>
          {showSub && !hideSub && job ? <AmountSubline job={job} className={`${s.sub} leading-snug`} /> : null}
        </div>
      ) : (
        <>
          {label ? (
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
              {label}
            </div>
          ) : null}
          <div className={`${s.main} tabular-nums`}>{main}</div>
          {showSub && job ? <AmountSubline job={job} className={`${s.sub} leading-snug`} /> : null}
        </>
      )}
    </div>
  );
}