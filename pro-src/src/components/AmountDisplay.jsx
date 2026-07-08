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
  const showDueRing = highlightDue && job && !job.paid && due > 0.01;
  return (
    <div
      className={`text-right shrink-0 max-w-[46%] lg:max-w-none ${showDueRing ? "rounded-xl border border-slate-200 bg-slate-100/80 px-2.5 py-1.5" : ""}`}
      data-testid="amount-display"
    >
      {label ? (
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">{label}</div>
      ) : null}
      <div className={`${s.main} tabular-nums`}>{main}</div>
      {showSub && job ? <AmountSubline job={job} className={`${s.sub} leading-snug`} /> : null}
    </div>
  );
}