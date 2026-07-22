// Compact transaction list for ONE job/invoice only (not the full customer ledger).
// Shown under Job Information when the Payment history toggle is on.
// Tabs: All · Invoices · Payments · Estimates (same as customer short history).
import React, { useMemo, useState } from "react";
import {
  buildCustomerTransactions,
  formatTxnAmount,
  txnFilterCounts,
  txnKindStyle,
} from "../lib/customerTransactions.js";
import { amountPaid, openBalance, paidPct } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "estimates", label: "Estimates" },
];

function Row({ row }) {
  const kind = txnKindStyle(row.kind);
  const amount =
    row.kind === "payment"
      ? formatTxnAmount(row.amount)
      : row.total > 0
        ? formatTxnAmount(row.total)
        : "";
  const amountClass = row.kind === "payment" ? "text-emerald-700" : "text-slate-800";
  const mid =
    row.kind === "payment"
      ? [row.method || "Payment", row.docNo ? "#" + row.docNo : ""].filter(Boolean).join(" · ")
      : row.docNo
        ? "#" + row.docNo
        : "";

  return (
    <div
      className="w-full text-left rounded-lg border border-slate-100 bg-white px-2.5 py-1.5"
      data-testid={
        row.kind === "payment"
          ? "job-txn-pay-" + (row.payment?.id || row.id)
          : row.kind === "estimate"
            ? "job-txn-est-" + row.docNo
            : "job-txn-inv-" + row.docNo
      }
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span
            className={
              "text-[10px] font-extrabold uppercase tracking-wide shrink-0 " + kind.className
            }
            data-testid={"job-txn-kind-" + row.kind}
          >
            {kind.label}
          </span>
          {row.dateLabel ? (
            <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{row.dateLabel}</span>
          ) : null}
          {mid ? <span className="text-xs text-slate-600 truncate min-w-0">{mid}</span> : null}
        </div>
        {amount ? (
          <div className={"text-sm font-bold tabular-nums shrink-0 " + amountClass}>{amount}</div>
        ) : null}
      </div>
      {row.kind === "invoice" && row.due > 0.01 && Math.abs((row.due || 0) - (row.total || 0)) > 0.01 ? (
        <div className="text-right text-[11px] font-semibold tabular-nums text-red-600 mt-0.5">
          Due {formatTxnAmount(row.due)}
        </div>
      ) : null}
    </div>
  );
}

export default function JobTransactionHistory({ job, onOpenFull }) {
  const [filter, setFilter] = useState("all");
  const jobs = useMemo(() => (job ? [job] : []), [job]);
  const counts = useMemo(() => txnFilterCounts(jobs), [jobs]);
  const rows = useMemo(
    () => buildCustomerTransactions(jobs, { filter, sort: "new" }),
    [jobs, filter]
  );
  const paid = amountPaid(job);
  const due = openBalance(job);
  const pct = paidPct(job);

  return (
    <div className="card px-3 py-2.5 space-y-2" data-testid="job-txn-history">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-600 min-w-0">
          <span>
            Paid: <b className="text-slate-800">{fmt$(paid) || "$0"}</b>
            {pct ? <span className="text-slate-400"> ({pct}%)</span> : null}
          </span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span>
            Open: <b className="text-slate-800">{due > 0 ? fmt$(due) : "Paid"}</b>
          </span>
          {job?.invoiceNo ? (
            <span className="block text-slate-400 mt-0.5">Invoice #{job.invoiceNo}</span>
          ) : null}
        </div>
        {onOpenFull ? (
          <button
            type="button"
            className="text-[11px] font-bold text-brand shrink-0"
            data-testid="job-txn-open-full"
            onClick={onOpenFull}
          >
            Edit payments →
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="job-txn-filters">
        {FILTERS.map((f) => {
          const n = counts[f.id] ?? 0;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={
                "rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors " +
                (active
                  ? "bg-brand-soft text-brand border-brand/30"
                  : "bg-slate-50 text-slate-500 border-slate-200")
              }
              data-testid={"job-txn-filter-" + f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {n > 0 ? <span className="opacity-70"> {n}</span> : null}
            </button>
          );
        })}
      </div>

      {!rows.length ? (
        <p className="text-xs text-slate-400 text-center py-2" data-testid="job-txn-empty">
          No transactions match this filter.
        </p>
      ) : (
        <div className="space-y-1" data-testid="job-txn-list">
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
