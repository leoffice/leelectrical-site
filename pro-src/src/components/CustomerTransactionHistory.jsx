// Compact short-transaction list for a customer company (all job addresses;
// not sub-companies). Shown under Invoice/Estimates/CO/Addresses tabs when
// "Short transactions" is on. Prefer one-line rows; second line only for due.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildCustomerTransactions,
  formatTxnAmount,
  txnFilterCounts,
  txnKindStyle,
} from "../lib/customerTransactions.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "estimates", label: "Estimates" },
];

/** Doc # chip: color + shape (pill / square / tag) so invoices stay distinguishable. */
function DocBubble({ docNo, color, testId }) {
  if (!docNo) return null;
  const c = color || {};
  const shape = c.shape || "pill";
  const shapeCls =
    shape === "square"
      ? "rounded-md"
      : shape === "tag"
        ? "rounded-sm border-l-2"
        : "rounded-full";
  return (
    <span
      className={
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ring-1 border shrink-0 " +
        shapeCls +
        " " +
        (c.bg || "bg-slate-100") +
        " " +
        (c.text || "text-slate-700") +
        " " +
        (c.ring || "ring-slate-200") +
        " " +
        (c.border || "border-slate-300")
      }
      data-testid={testId}
      data-shape={shape}
    >
      {docNo}
    </span>
  );
}

/** One-line row: type · # · date · place · amount (due on 2nd line if needed). */
function CompactRow({ row, onOpen, testId }) {
  const kind = txnKindStyle(row.kind);
  const amount =
    row.kind === "payment"
      ? formatTxnAmount(row.amount)
      : row.total > 0
        ? formatTxnAmount(row.total)
        : "";
  const amountClass =
    row.kind === "payment" ? "text-emerald-700" : "text-slate-800";
  const due =
    row.kind === "invoice" && row.due > 0.01 && Math.abs((row.due || 0) - (row.total || 0)) > 0.01
      ? formatTxnAmount(row.due)
      : "";
  const mid =
    row.kind === "payment"
      ? [row.method || "Payment", row.address].filter(Boolean).join(" · ")
      : row.address || "";

  return (
    <button
      type="button"
      className="w-full text-left rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 active:bg-slate-50"
      data-testid={testId}
      onClick={() => onOpen(row)}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span
            className={
              "text-[10px] font-extrabold uppercase tracking-wide shrink-0 " + kind.className
            }
            data-testid={"cust-txn-kind-" + row.kind}
          >
            {kind.label}
          </span>
          {row.docNo ? (
            <DocBubble
              docNo={row.docNo}
              color={row.color}
              testId={
                row.kind === "payment"
                  ? "cust-txn-pay-bubble-" + row.docNo
                  : row.kind === "estimate"
                    ? "cust-txn-est-bubble-" + row.docNo
                    : "cust-txn-bubble-" + row.docNo
              }
            />
          ) : null}
          {row.dateLabel ? (
            <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{row.dateLabel}</span>
          ) : null}
          {mid ? (
            <span className="text-xs text-slate-600 truncate min-w-0">{mid}</span>
          ) : null}
        </div>
        {amount ? (
          <div className={"text-sm font-bold tabular-nums shrink-0 " + amountClass}>{amount}</div>
        ) : null}
      </div>
      {due ? (
        <div className="text-right text-[11px] font-semibold tabular-nums text-red-600 mt-0.5">
          Due {due}
        </div>
      ) : null}
    </button>
  );
}

export default function CustomerTransactionHistory({ jobs, fromCust = "" }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("new");

  const counts = useMemo(() => txnFilterCounts(jobs), [jobs]);
  const rows = useMemo(
    () => buildCustomerTransactions(jobs, { filter, sort }),
    [jobs, filter, sort]
  );

  const openRow = (row) => {
    if (!row?.jobId) return;
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    parts.push("fold=1");
    nav("/job/" + row.jobId + "?" + parts.join("&"));
  };

  return (
    <div className="card px-3 py-2.5 space-y-2" data-testid="customer-txn-history">
      <div className="space-y-2" data-testid="customer-txn-panel">
        <div className="flex flex-wrap items-center gap-1.5">
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
                data-testid={"cust-txn-filter-" + f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {n > 0 ? <span className="opacity-70"> {n}</span> : null}
              </button>
            );
          })}
          <div className="ml-auto flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              className={
                "px-2 py-1 text-[10px] font-bold " +
                (sort === "new" ? "bg-slate-800 text-white" : "bg-white text-slate-500")
              }
              data-testid="cust-txn-sort-new"
              onClick={() => setSort("new")}
            >
              Newest
            </button>
            <button
              type="button"
              className={
                "px-2 py-1 text-[10px] font-bold border-l border-slate-200 " +
                (sort === "old" ? "bg-slate-800 text-white" : "bg-white text-slate-500")
              }
              data-testid="cust-txn-sort-old"
              onClick={() => setSort("old")}
            >
              Oldest
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3" data-testid="customer-txn-empty">
            No transactions match this filter.
          </p>
        ) : (
          <div className="space-y-1" data-testid="customer-txn-list">
            {rows.map((row) => {
              const testId =
                row.kind === "invoice"
                  ? "cust-txn-inv-" + row.docNo
                  : row.kind === "payment"
                    ? "cust-txn-pay-" + (row.payment?.id || row.id)
                    : row.kind === "estimate"
                      ? "cust-txn-est-" + row.docNo
                      : "cust-txn-" + row.id;
              return <CompactRow key={row.id} row={row} onOpen={openRow} testId={testId} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
