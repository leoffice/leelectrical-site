// Compact transaction list for ONE job/invoice only (not the full customer ledger).
// Shown under Job Information when the Transaction history toggle is on.
// Tabs: All · Invoices · Payments · Estimates (same as customer short history).
import React, { useMemo, useState } from "react";
import {
  buildCustomerTransactions,
  txnKindStyle,
  txnRowDisplay,
} from "../lib/customerTransactions.js";
import { suggestInvoiceForPayment } from "../lib/paymentApply.js";
import { amountPaid, faceOpenBalance, paidPct } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "estimates", label: "Estimates" },
];

function countKinds(rows) {
  let invoices = 0;
  let payments = 0;
  let estimates = 0;
  for (const r of rows) {
    if (r.kind === "invoice") invoices += 1;
    else if (r.kind === "payment") payments += 1;
    else if (r.kind === "estimate") estimates += 1;
  }
  return { all: rows.length, invoices, payments, estimates };
}

function DocBubble({ docNo, color }) {
  if (!docNo) return null;
  const c = color || {};
  const shape = c.shape || "pill";
  const shapeCls =
    shape === "square" ? "rounded-md" : shape === "tag" ? "rounded-sm border-l-2" : "rounded-full";
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
      data-testid={"job-txn-bubble-" + docNo}
    >
      {docNo}
    </span>
  );
}

function Row({ row, onOpen }) {
  const kind = txnKindStyle(row.kind);
  const { amount, amountClass, isOpen } = txnRowDisplay(row);
  const unlinkedPay = row.kind === "payment" && row.unlinked;
  const suggest = row.kind === "payment" ? row.applySuggestion : null;
  const mid =
    row.kind === "payment"
      ? [row.method || "Payment"].filter(Boolean).join(" · ")
      : row.address || "";
  const clickable = typeof onOpen === "function";

  const rowTestId =
    row.kind === "payment"
      ? "job-txn-pay-" + (row.payment?.id || row.id)
      : row.kind === "estimate"
        ? "job-txn-est-" + row.docNo
        : "job-txn-inv-" + row.docNo;

  return (
    <div
      className={
        "w-full text-left rounded-lg border overflow-hidden " +
        (unlinkedPay
          ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200"
          : "border-slate-100 bg-white") +
        (isOpen ? " flex items-stretch" : "")
      }
      data-testid={rowTestId}
      data-open-invoice={isOpen ? "1" : "0"}
      data-unlinked-payment={unlinkedPay ? "1" : "0"}
    >
      {isOpen ? (
        <span
          className="w-1.5 shrink-0 self-stretch bg-red-500"
          data-testid="job-txn-open-rail"
          aria-hidden
        />
      ) : null}
      <div className="flex-1 min-w-0">
        {clickable ? (
          <button
            type="button"
            className={
              "w-full text-left px-2.5 py-1.5 " +
              (unlinkedPay ? "active:bg-amber-100/80" : "active:bg-slate-50")
            }
            onClick={() => onOpen(row)}
          >
            <RowInner
              kind={kind}
              unlinkedPay={unlinkedPay}
              row={row}
              mid={mid}
              amount={amount}
              amountClass={amountClass}
            />
          </button>
        ) : (
          <div className="px-2.5 py-1.5">
            <RowInner
              kind={kind}
              unlinkedPay={unlinkedPay}
              row={row}
              mid={mid}
              amount={amount}
              amountClass={amountClass}
            />
          </div>
        )}
        {clickable && unlinkedPay && suggest?.kind === "invoice" && suggest.docNo ? (
          <div className="px-2.5 pb-1.5">
            <button
              type="button"
              className="w-full rounded-lg border border-brand/40 bg-white text-brand text-[11px] font-bold py-1.5 px-2 active:bg-brand-soft"
              data-testid={"job-txn-apply-" + suggest.docNo}
              onClick={() =>
                onOpen({
                  ...row,
                  applyTargetJobId: suggest.job?.id,
                  applyTargetDocNo: suggest.docNo,
                  openApply: true,
                })
              }
            >
              Apply to invoice #{suggest.docNo}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RowInner({ kind, unlinkedPay, row, mid, amount, amountClass }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
        <span
          className={
            "text-[10px] font-extrabold uppercase tracking-wide shrink-0 " +
            (unlinkedPay ? "text-amber-800" : kind.className)
          }
          data-testid={"job-txn-kind-" + row.kind}
        >
          {kind.label}
        </span>
        {row.docNo ? (
          <DocBubble docNo={row.docNo} color={row.color} />
        ) : unlinkedPay ? (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-200 text-amber-950 ring-1 ring-amber-400 border border-amber-400 shrink-0"
            data-testid="job-txn-unlinked-badge"
          >
            No invoice
          </span>
        ) : null}
        {row.dateLabel ? (
          <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{row.dateLabel}</span>
        ) : null}
        {mid ? <span className="text-xs text-slate-600 truncate min-w-0">{mid}</span> : null}
      </div>
      {amount ? (
        <div
          className={"text-sm font-bold tabular-nums shrink-0 " + amountClass}
          data-testid="job-txn-amount"
        >
          {amount}
        </div>
      ) : null}
    </div>
  );
}

export default function JobTransactionHistory({
  job,
  /** Full customer job list so unlinked payments can suggest other invoices. */
  customerJobs,
  onOpenFull,
  onOpenRow,
}) {
  const [filter, setFilter] = useState("all");
  // Suggest across the customer; still only SHOW this job's rows.
  const suggestJobs = useMemo(() => {
    if (Array.isArray(customerJobs) && customerJobs.length) return customerJobs;
    return job ? [job] : [];
  }, [customerJobs, job]);
  const jobs = useMemo(() => (job ? [job] : []), [job]);
  // Build once — filter/count from the same list (faster than rebuild per tab).
  const allRows = useMemo(() => {
    const rows = buildCustomerTransactions(jobs, { filter: "all", sort: "new" });
    // Re-suggest using the wider customer list so "Apply to invoice #…" works.
    if (suggestJobs.length <= 1) return rows;
    return rows.map((r) => {
      if (r.kind !== "payment" || !r.unlinked) return r;
      return {
        ...r,
        applySuggestion: suggestInvoiceForPayment(suggestJobs, r.job, r.payment),
      };
    });
  }, [jobs, suggestJobs]);
  const counts = useMemo(() => countKinds(allRows), [allRows]);
  const rows = useMemo(() => {
    if (filter === "all") return allRows;
    if (filter === "invoices") return allRows.filter((r) => r.kind === "invoice");
    if (filter === "payments") return allRows.filter((r) => r.kind === "payment");
    if (filter === "estimates") return allRows.filter((r) => r.kind === "estimate");
    return allRows;
  }, [allRows, filter]);
  const paid = amountPaid(job);
  // Job face open — provisional renews still show fee, not "Paid"
  const due = faceOpenBalance(job);
  const pct = paidPct(job);

  // onOpenFull kept for callers that open the full payment editor from a payment row;
  // the separate "Edit payments →" button is gone — tap a payment instead.
  void onOpenFull;

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
            <Row key={row.id} row={row} onOpen={onOpenRow} />
          ))}
        </div>
      )}
    </div>
  );
}
