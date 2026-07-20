// Compact short-transaction list for a customer company (all job addresses;
// not sub-companies). Shown under Invoice/Estimates/CO/Addresses tabs when
// "Short transactions" is on. Prefer one-line rows; second line only for due.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildCustomerTransactions,
  customerTransactionSummary,
  formatTxnAmount,
  txnFilterCounts,
} from "../lib/customerTransactions.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "invoices", label: "Invoices" },
  { id: "estimates", label: "Estimates" },
  { id: "open", label: "Open balance" },
];

const KIND_ICON = { invoice: "🧾", estimate: "📄", payment: "💵", credit: "↩️" };

/** Total invoiced · paid · balance due across this customer's whole history. */
function SummaryStrip({ summary }) {
  const cells = [
    { key: "invoiced", label: "Invoiced", value: summary.invoiced, tone: "text-slate-800" },
    { key: "paid", label: "Paid", value: summary.paid, tone: "text-emerald-700" },
    { key: "due", label: "Balance due", value: summary.due, tone: summary.due > 0.01 ? "text-red-600" : "text-slate-800" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="cust-txn-summary">
      {cells.map((c) => (
        <div key={c.key} className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{c.label}</div>
          <div
            className={"text-sm font-extrabold tabular-nums " + c.tone}
            data-testid={"cust-txn-summary-" + c.key}
          >
            {formatTxnAmount(c.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocBubble({ docNo, color, testId }) {
  if (!docNo) return null;
  const c = color || {};
  return (
    <span
      className={
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ring-1 shrink-0 " +
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

/** One-line row: type · # · date · place · amount (due on 2nd line if needed). */
function CompactRow({ row, onOpen, testId }) {
  const kindLabel =
    row.kind === "payment" ? "Payment" : row.kind === "estimate" ? "Estimate" : "Invoice";
  const kindClass =
    row.kind === "payment"
      ? "text-emerald-600"
      : "text-slate-400";
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
      ? [row.method || "Payment", row.ref ? "ref " + row.ref : "", row.address]
          .filter(Boolean)
          .join(" · ")
      : row.kind === "estimate"
        ? [row.statusLabel, row.address].filter(Boolean).join(" · ")
        : row.address || "";

  /* The relation line — what this row is attached to. A payment must either
   * name its invoice or say plainly that it can't; it must never show a
   * plausible-looking but unverified invoice number. */
  const relation =
    row.kind === "payment" ? (
      row.unlinked ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-1.5 py-0.5 text-[10px] font-bold"
          data-testid={"cust-txn-unlinked-" + (row.payment?.id || row.id)}
        >
          ⚠️ Unlinked — needs review
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
          Applied to
          <DocBubble
            docNo={"Invoice #" + row.docNo}
            color={row.color}
            testId={"cust-txn-applied-" + row.docNo}
          />
        </span>
      )
    ) : row.kind === "estimate" && row.convertedTo ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
        Became
        <DocBubble
          docNo={"Invoice #" + row.convertedTo}
          color={row.color}
          testId={"cust-txn-converted-" + row.convertedTo}
        />
      </span>
    ) : row.kind === "invoice" ? (
      <span
        className={
          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 " +
          (row.isOpen
            ? "bg-red-50 text-red-700 ring-red-200"
            : "bg-emerald-50 text-emerald-700 ring-emerald-200")
        }
        data-testid={"cust-txn-status-" + row.docNo}
      >
        {row.statusLabel}
      </span>
    ) : null;

  return (
    <button
      type="button"
      className="w-full text-left rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 active:bg-slate-50"
      data-testid={testId}
      onClick={() => onOpen(row)}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span className="text-xs shrink-0" aria-hidden="true">{KIND_ICON[row.kind] || ""}</span>
          <span className={"text-[10px] font-extrabold uppercase tracking-wide shrink-0 " + kindClass}>
            {kindLabel}
          </span>
          {/* Payments carry their number on the relation line ("Applied to
              Invoice #X") instead, so it is never ambiguous whose number it is. */}
          {row.docNo && row.kind !== "payment" ? (
            <DocBubble
              docNo={row.docNo}
              color={row.color}
              testId={
                row.kind === "estimate"
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
      {relation || due ? (
        <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
          <span className="min-w-0 truncate">{relation}</span>
          {due ? (
            <span className="text-[11px] font-semibold tabular-nums text-red-600 shrink-0">
              Due {due}
            </span>
          ) : null}
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
  const summary = useMemo(() => customerTransactionSummary(jobs), [jobs]);
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
        <SummaryStrip summary={summary} />
        {counts.unlinked > 0 ? (
          <p
            className="text-[10px] font-bold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-2 py-1"
            data-testid="cust-txn-unlinked-banner"
          >
            ⚠️ {counts.unlinked} payment{counts.unlinked === 1 ? "" : "s"} could not be matched to an
            invoice — review before trusting the paid total.
          </p>
        ) : null}
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
