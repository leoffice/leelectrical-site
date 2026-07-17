// Toggle under the customer card — full transaction history for this company
// (all job addresses; not sub-companies). Filter + sort; linked invoice #
// shown in a matching colored oval bubble on payments and invoices.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toggle from "./Toggle.jsx";
import {
  buildCustomerTransactions,
  formatTxnAmount,
  txnFilterCounts,
} from "../lib/customerTransactions.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "estimates", label: "Estimates" },
];

function DocBubble({ docNo, color, testId }) {
  if (!docNo) return null;
  const c = color || {};
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ring-1 " +
        (c.bg || "bg-slate-100") +
        " " +
        (c.text || "text-slate-700") +
        " " +
        (c.ring || "ring-slate-200")
      }
      data-testid={testId}
    >
      {docNo}
    </span>
  );
}

function InvoiceRow({ row, onOpen }) {
  const total = formatTxnAmount(row.total);
  const due = row.due > 0.01 ? formatTxnAmount(row.due) : "";
  const dueDiffers = due && Math.abs((row.due || 0) - (row.total || 0)) > 0.01;
  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-slate-100 bg-white px-3 py-2.5 active:bg-slate-50"
      data-testid={"cust-txn-inv-" + row.docNo}
      onClick={() => onOpen(row)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Invoice</span>
            <DocBubble docNo={row.docNo} color={row.color} testId={"cust-txn-bubble-" + row.docNo} />
            {row.dateLabel ? (
              <span className="text-[11px] text-slate-500 tabular-nums">{row.dateLabel}</span>
            ) : null}
          </div>
          {row.address ? (
            <p className="text-xs text-slate-600 truncate">{row.address}</p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular-nums text-slate-800">{total}</div>
          {dueDiffers ? (
            <div className="text-[11px] font-semibold tabular-nums text-red-600">Due {due}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function PaymentRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-slate-100 bg-white px-3 py-2.5 active:bg-slate-50"
      data-testid={"cust-txn-pay-" + (row.payment?.id || row.id)}
      onClick={() => onOpen(row)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Payment</span>
            {row.dateLabel ? (
              <span className="text-[11px] text-slate-500 tabular-nums">{row.dateLabel}</span>
            ) : null}
            {row.docNo ? (
              <DocBubble docNo={row.docNo} color={row.color} testId={"cust-txn-pay-bubble-" + row.docNo} />
            ) : null}
          </div>
          <p className="text-xs text-slate-600">
            {row.method || "Payment"}
            {row.address ? <span className="text-slate-400"> · {row.address}</span> : null}
          </p>
        </div>
        <div className="text-sm font-bold tabular-nums text-emerald-700 shrink-0">
          {formatTxnAmount(row.amount)}
        </div>
      </div>
    </button>
  );
}

function EstimateRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-slate-100 bg-white px-3 py-2.5 active:bg-slate-50"
      data-testid={"cust-txn-est-" + row.docNo}
      onClick={() => onOpen(row)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Estimate</span>
            <DocBubble docNo={row.docNo} color={row.color} testId={"cust-txn-est-bubble-" + row.docNo} />
            {row.dateLabel ? (
              <span className="text-[11px] text-slate-500 tabular-nums">{row.dateLabel}</span>
            ) : null}
          </div>
          {row.address ? (
            <p className="text-xs text-slate-600 truncate">{row.address}</p>
          ) : null}
        </div>
        {row.total > 0 ? (
          <div className="text-sm font-bold tabular-nums text-slate-800 shrink-0">
            {formatTxnAmount(row.total)}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function CustomerTransactionHistory({ jobs, fromCust = "" }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
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
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
            Transaction history
          </h2>
          {!open && counts.all > 0 ? (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {counts.all} item{counts.all === 1 ? "" : "s"} across this company
            </p>
          ) : null}
        </div>
        <Toggle
          on={open}
          onChange={setOpen}
          small
          label="Show transaction history"
        />
      </div>

      {open ? (
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
            <div className="space-y-1.5" data-testid="customer-txn-list">
              {rows.map((row) => {
                if (row.kind === "invoice") {
                  return <InvoiceRow key={row.id} row={row} onOpen={openRow} />;
                }
                if (row.kind === "payment") {
                  return <PaymentRow key={row.id} row={row} onOpen={openRow} />;
                }
                if (row.kind === "estimate") {
                  return <EstimateRow key={row.id} row={row} onOpen={openRow} />;
                }
                return null;
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
