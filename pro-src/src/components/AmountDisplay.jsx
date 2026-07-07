// Balance due (prominent) + invoiced / paid sub-line (small gray).
import React from "react";
import { amountPaid, fmtAmountDue, invoiceTotal, paidPct } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

const SIZE = {
  sm: { main: "font-bold text-sm", sub: "text-[9px]" },
  md: { main: "font-bold text-slate-900", sub: "text-[10px]" },
  lg: { main: "font-extrabold text-lg text-slate-900", sub: "text-[11px]" },
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

export default function AmountDisplay({ job, size = "md", showSub = true }) {
  const s = SIZE[size] || SIZE.md;
  const main = fmtAmountDue(job) || "—";
  return (
    <div className="text-right shrink-0" data-testid="amount-display">
      <div className={s.main}>{main}</div>
      {showSub && job ? <AmountSubline job={job} className={s.sub} /> : null}
    </div>
  );
}