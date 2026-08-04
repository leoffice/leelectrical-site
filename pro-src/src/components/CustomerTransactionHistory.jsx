// Compact short-transaction list for a customer company (all job addresses;
// not sub-companies). Shown under Invoice/Estimates/CO/Addresses tabs when
// "Short transactions" is on. Prefer one-line rows; second line only for due.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildCustomerTransactions,
  txnKindStyle,
  txnRowDisplay,
} from "../lib/customerTransactions.js";

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "invoices", label: "Invoices" },
  { id: "estimates", label: "Estimates" },
  { id: "jobs", label: "Jobs" },
];

function countKinds(rows) {
  let invoices = 0;
  let payments = 0;
  let estimates = 0;
  const jobIds = new Set();
  for (const r of rows) {
    if (r.kind === "invoice") invoices += 1;
    else if (r.kind === "payment") payments += 1;
    else if (r.kind === "estimate") estimates += 1;
    if (r.jobId) jobIds.add(String(r.jobId));
  }
  return { all: rows.length, invoices, payments, estimates, jobs: jobIds.size };
}

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

/** One-line row: type · # · date · place · amount (invoice = due only). */
function CompactRow({ row, onOpen, testId }) {
  const kind = txnKindStyle(row.kind);
  const { amount, amountClass, isOpen } = txnRowDisplay(row);
  const mid =
    row.kind === "payment"
      ? [row.method || "Payment", row.address].filter(Boolean).join(" · ")
      : row.address || "";
  const unlinkedPay = row.kind === "payment" && row.unlinked;
  const suggest = row.kind === "payment" ? row.applySuggestion : null;

  return (
    <div
      className={
        "w-full text-left rounded-lg border overflow-hidden " +
        (unlinkedPay
          ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200"
          : "border-slate-100 bg-white") +
        (isOpen ? " flex items-stretch" : "")
      }
      data-open-invoice={isOpen ? "1" : "0"}
      data-unlinked-payment={unlinkedPay ? "1" : "0"}
    >
      {isOpen ? (
        <span
          className="w-1.5 shrink-0 self-stretch bg-red-500"
          data-testid="cust-txn-open-rail"
          aria-hidden
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          data-testid={testId}
          className={
            "w-full text-left px-2.5 py-1.5 " +
            (unlinkedPay ? "active:bg-amber-100/80" : "active:bg-slate-50")
          }
          onClick={() => onOpen(row)}
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              <span
                className={
                  "text-[10px] font-extrabold uppercase tracking-wide shrink-0 " +
                  (unlinkedPay ? "text-amber-800" : kind.className)
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
              ) : unlinkedPay ? (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-200 text-amber-950 ring-1 ring-amber-400 border border-amber-400 shrink-0"
                  data-testid="cust-txn-unlinked-badge"
                >
                  No invoice
                </span>
              ) : null}
              {row.dateLabel ? (
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{row.dateLabel}</span>
              ) : null}
              {mid ? (
                <span className="text-xs text-slate-600 truncate min-w-0">{mid}</span>
              ) : null}
            </div>
            {amount ? (
              <div
                className={"text-sm font-bold tabular-nums shrink-0 " + amountClass}
                data-testid="cust-txn-amount"
              >
                {amount}
              </div>
            ) : null}
          </div>
        </button>
        {unlinkedPay && suggest?.kind === "invoice" && suggest.docNo ? (
          <div className="px-2.5 pb-1.5">
            <button
              type="button"
              className="w-full rounded-lg border border-brand/40 bg-white text-brand text-[11px] font-bold py-1.5 px-2 active:bg-brand-soft"
              data-testid={"cust-txn-apply-" + suggest.docNo}
              onClick={(e) => {
                e.stopPropagation();
                onOpen({
                  ...row,
                  applyTargetJobId: suggest.job?.id,
                  applyTargetDocNo: suggest.docNo,
                  openApply: true,
                });
              }}
            >
              Apply to invoice #{suggest.docNo}
            </button>
          </div>
        ) : unlinkedPay && suggest?.kind === "estimate" ? (
          <div className="px-2.5 pb-1.5">
            <button
              type="button"
              className="w-full rounded-lg border border-amber-400 bg-white text-amber-900 text-[11px] font-bold py-1.5 px-2 active:bg-amber-100"
              data-testid="cust-txn-apply-estimate"
              onClick={(e) => {
                e.stopPropagation();
                onOpen({
                  ...row,
                  applyTargetJobId: suggest.job?.id,
                  applyTargetDocNo: suggest.docNo,
                  openApply: true,
                  convertEstimate: true,
                });
              }}
            >
              {suggest.label || "Convert estimate then apply"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CustomerTransactionHistory({
  jobs,
  fromCust = "",
  onOpenRow,
  /** Company-wide History defaults to Open so paid $0 walls don't look like fake data. */
  defaultFilter = "all",
}) {
  const nav = useNavigate();
  const [filter, setFilter] = useState(defaultFilter || "all");
  const [sort, setSort] = useState("new");

  // Build full list once per jobs/sort — filter tabs are free after that.
  const allRows = useMemo(
    () => buildCustomerTransactions(jobs, { filter: "all", sort }),
    [jobs, sort]
  );
  const counts = useMemo(() => countKinds(allRows), [allRows]);
  const rows = useMemo(() => {
    if (filter === "open") {
      // Open invoices (due > 0) + recent payments — hide paid-in-full $0 noise.
      return allRows.filter((r) => {
        if (r.kind === "payment") return true;
        if (r.kind === "invoice") return txnRowDisplay(r).isOpen;
        return false;
      });
    }
    if (filter === "all") return allRows;
    if (filter === "invoices") {
      // Levi 2026-07-28: open (still due) first, then closed — keep date order within groups.
      const list = allRows.filter((r) => r.kind === "invoice");
      return list.slice().sort((a, b) => {
        const ao = txnRowDisplay(a).isOpen ? 0 : 1;
        const bo = txnRowDisplay(b).isOpen ? 0 : 1;
        return ao - bo;
      });
    }
    if (filter === "payments") return allRows.filter((r) => r.kind === "payment");
    if (filter === "estimates") return allRows.filter((r) => r.kind === "estimate");
    if (filter === "jobs") {
      // One latest activity row per job (invoices/estimates preferred over payments).
      const byJob = new Map();
      for (const r of allRows) {
        if (!r.jobId) continue;
        const prev = byJob.get(r.jobId);
        if (!prev) {
          byJob.set(r.jobId, r);
          continue;
        }
        const rank = (x) => (x.kind === "invoice" ? 0 : x.kind === "estimate" ? 1 : 2);
        if (rank(r) < rank(prev)) byJob.set(r.jobId, r);
      }
      return Array.from(byJob.values());
    }
    return allRows;
  }, [allRows, filter]);

  const openRow = (row) => {
    // Parent can open payment/invoice sheets in-place (snappy — no full job remount).
    if (typeof onOpenRow === "function") {
      onOpenRow(row);
      return;
    }
    if (!row?.jobId) return;
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    // fold=1: collapse progress below job info; focus=job scrolls job card into view.
    parts.push("fold=1");
    parts.push("focus=job");
    if (row.kind === "payment") {
      // Open payment card so Levi can edit/delete/reassign invoice or customer.
      parts.push("payhist=1");
      const payId = row.payment?.id;
      if (payId) parts.push("payId=" + encodeURIComponent(String(payId)));
    }
    nav("/job/" + row.jobId + "?" + parts.join("&"));
  };

  return (
    <div className="card px-3 py-2.5 space-y-2" data-testid="customer-txn-history">
      <div className="space-y-2" data-testid="customer-txn-panel">
        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-0.5">
          Transaction history
        </p>
        <p className="text-[10px] text-slate-400 px-0.5 -mt-1">
          Tap a payment to open its card — edit, reassign invoice/customer, or delete.
        </p>
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
