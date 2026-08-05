// Compact short-transaction list for a customer company (all job addresses;
// not sub-companies). Shown under Invoice/Estimates/CO/Addresses tabs when
// "Short transactions" is on. Prefer one-line rows; second line only for due.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildCustomerTransactions,
  txnKindStyle,
  txnRowDisplay,
  txnStoryLine,
} from "../lib/customerTransactions.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "payments", label: "Payments" },
  { id: "invoices", label: "Invoices" },
  { id: "estimates", label: "Estimates" },
  { id: "jobs", label: "Addresses" },
];

function countKinds(rows) {
  let invoices = 0;
  let payments = 0;
  let estimates = 0;
  let open = 0;
  const jobIds = new Set();
  const addresses = new Set();
  for (const r of rows) {
    if (r.kind === "invoice") {
      invoices += 1;
      if (txnRowDisplay(r).isOpen) open += 1;
    } else if (r.kind === "payment") payments += 1;
    else if (r.kind === "estimate") estimates += 1;
    if (r.jobId) jobIds.add(String(r.jobId));
    if (r.address) addresses.add(String(r.address));
  }
  return {
    all: rows.length,
    open: open + payments, // open filter includes payments
    invoices,
    payments,
    estimates,
    jobs: addresses.size || jobIds.size,
  };
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
  // Levi 2026-08-04: larger chip, not heavy bold — translucent tint from palette
  return (
    <span
      className={
        "inline-flex items-center px-2 py-1 text-[13px] font-semibold tabular-nums ring-1 border shrink-0 opacity-90 " +
        shapeCls +
        " " +
        (c.bg || "bg-slate-100") +
        " " +
        (c.text || "text-slate-700") +
        " " +
        (c.ring || "ring-slate-200/60") +
        " " +
        (c.border || "border-slate-300/50")
      }
      data-testid={testId}
      data-shape={shape}
    >
      {docNo}
    </span>
  );
}

/**
 * Glanceable activity row (ADHD-friendly):
 *   WHEN          STORY                         AMOUNT / status
 *   Today         Name · paid Zelle on #123      $2,000
 *   # bubble opens job; rest of row opens payment/detail.
 */
function CompactRow({ row, onOpen, onOpenJob, testId }) {
  const kind = txnKindStyle(row.kind);
  const { amount, amountClass, isOpen } = txnRowDisplay(row);
  const unlinkedPay = row.kind === "payment" && row.unlinked;
  const suggest = row.kind === "payment" ? row.applySuggestion : null;
  const when = row.whenLabel || row.dateLabel || "";
  const story = txnStoryLine(row);
  const place = row.address || "";

  const statusPill =
    row.kind === "payment"
      ? { text: "Paid", cls: "bg-emerald-100 text-emerald-800" }
      : row.kind === "estimate"
        ? { text: "Estimate", cls: "bg-amber-100 text-amber-900" }
        : isOpen
          ? { text: "Open", cls: "bg-red-100 text-red-800" }
          : { text: "Paid", cls: "bg-emerald-100 text-emerald-800" };

  return (
    <div
      className={
        "w-full text-left rounded-xl border overflow-hidden " +
        (unlinkedPay
          ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200"
          : isOpen
            ? "border-red-100 bg-white"
            : "border-slate-100 bg-white") +
        " flex items-stretch"
      }
      data-open-invoice={isOpen ? "1" : "0"}
      data-unlinked-payment={unlinkedPay ? "1" : "0"}
      data-legacy-web={row.legacyWeb ? "1" : "0"}
    >
      {isOpen ? (
        <span
          className="w-1.5 shrink-0 self-stretch bg-red-500"
          data-testid="cust-txn-open-rail"
          aria-hidden
        />
      ) : (
        <span
          className={
            "w-1.5 shrink-0 self-stretch " +
            (row.kind === "payment" ? "bg-emerald-400" : "bg-slate-200")
          }
          aria-hidden
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-stretch min-w-0">
          {/* Doc # chip → job page (Levi: colored box goes to full job) */}
          {row.docNo ? (
            <button
              type="button"
              className="shrink-0 px-2 py-2 self-center"
              data-testid={
                row.kind === "payment"
                  ? "cust-txn-pay-bubble-" + row.docNo
                  : row.kind === "estimate"
                    ? "cust-txn-est-bubble-" + row.docNo
                    : "cust-txn-bubble-" + row.docNo
              }
              title="Open job"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onOpenJob === "function") onOpenJob(row);
                else onOpen(row);
              }}
            >
              <DocBubble docNo={row.docNo} color={row.color} testId={undefined} />
            </button>
          ) : null}
          <button
            type="button"
            data-testid={testId}
            className={
              "flex-1 min-w-0 text-left px-2 py-2 " +
              (unlinkedPay ? "active:bg-amber-100/80" : "active:bg-slate-50")
            }
            onClick={() => onOpen(row)}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold " +
                      statusPill.cls
                    }
                    data-testid={"cust-txn-kind-" + row.kind}
                  >
                    {statusPill.text}
                  </span>
                  {when ? (
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums shrink-0">
                      {when}
                    </span>
                  ) : null}
                  {row.legacyWeb ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Legacy
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5 leading-snug">
                  {story || kind.label}
                </p>
                {place ? (
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{place}</p>
                ) : null}
              </div>
              {amount ? (
                <div
                  className={
                    "text-base font-extrabold tabular-nums shrink-0 leading-none pt-0.5 " +
                    amountClass
                  }
                  data-testid="cust-txn-amount"
                >
                  {amount}
                </div>
              ) : null}
            </div>
          </button>
        </div>
        {unlinkedPay && suggest?.kind === "invoice" && suggest.docNo ? (
          <div className="px-2.5 pb-2">
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
          <div className="px-2.5 pb-2">
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
  /** Company-wide uses "all" (Levi 2026-08-04) — full feed, not open-only. */
  defaultFilter = "all",
  /** Hide legacy WEB##### paid invoices from ~2014 unless turned on. */
  hideLegacyWebDefault = true,
}) {
  const nav = useNavigate();
  const [filter, setFilter] = useState(defaultFilter || "all");
  const [sort, setSort] = useState("new");
  const [showLegacyWeb, setShowLegacyWeb] = useState(!hideLegacyWebDefault);

  // Build full list once per jobs/sort — filter tabs are free after that.
  const allRows = useMemo(
    () => buildCustomerTransactions(jobs, { filter: "all", sort }),
    [jobs, sort]
  );
  const scopedRows = useMemo(() => {
    if (showLegacyWeb) return allRows;
    return allRows.filter((r) => !r.legacyWeb);
  }, [allRows, showLegacyWeb]);
  const legacyCount = useMemo(
    () => allRows.filter((r) => r.legacyWeb).length,
    [allRows]
  );
  const counts = useMemo(() => countKinds(scopedRows), [scopedRows]);
  const rows = useMemo(() => {
    if (filter === "open") {
      return scopedRows.filter((r) => {
        if (r.kind === "payment") return true;
        if (r.kind === "invoice") return txnRowDisplay(r).isOpen;
        return false;
      });
    }
    if (filter === "all") return scopedRows;
    if (filter === "invoices") {
      const list = scopedRows.filter((r) => r.kind === "invoice");
      return list.slice().sort((a, b) => {
        const ao = txnRowDisplay(a).isOpen ? 0 : 1;
        const bo = txnRowDisplay(b).isOpen ? 0 : 1;
        return ao - bo;
      });
    }
    if (filter === "payments") return scopedRows.filter((r) => r.kind === "payment");
    if (filter === "estimates") return scopedRows.filter((r) => r.kind === "estimate");
    if (filter === "jobs") {
      // Pure address list only — not activity rows (Levi 2026-08-05 screenshot/voice).
      const byAddr = new Map();
      for (const r of scopedRows) {
        const label = String(r.address || "").trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const prev = byAddr.get(key);
        if (!prev) {
          byAddr.set(key, {
            _addressOnly: true,
            address: label,
            jobId: r.jobId,
            jobCount: 1,
            jobIds: new Set([String(r.jobId || "")]),
          });
        } else {
          prev.jobIds.add(String(r.jobId || ""));
          prev.jobCount = prev.jobIds.size;
        }
      }
      // Also count from raw jobs when rows lack address
      return Array.from(byAddr.values()).sort((a, b) =>
        String(a.address).localeCompare(String(b.address))
      );
    }
    return scopedRows;
  }, [scopedRows, filter]);

  const openJob = (row) => {
    if (!row?.jobId) return;
    const parts = ["fold=1", "focus=job"];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    nav("/job/" + row.jobId + "?" + parts.join("&"));
  };

  const openRow = (row) => {
    // Parent can open payment/invoice sheets in-place (snappy — no full job remount).
    if (typeof onOpenRow === "function") {
      onOpenRow(row);
      return;
    }
    if (!row?.jobId) return;
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    parts.push("fold=1");
    parts.push("focus=job");
    if (row.kind === "payment") {
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
          What happened
        </p>
        <p className="text-[10px] text-slate-400 px-0.5 -mt-1 leading-snug">
          Newest first. Tap the colored # for the full job. Tap the rest for the payment or invoice card.
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
        {legacyCount > 0 ? (
          <label className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold px-0.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={showLegacyWeb}
              onChange={(e) => setShowLegacyWeb(e.target.checked)}
              data-testid="cust-txn-show-legacy-web"
            />
            Show old WEB# invoices ({legacyCount}) — paid 2014 QBO web numbers
          </label>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3" data-testid="customer-txn-empty">
            {filter === "jobs" ? "No service addresses on file." : "No transactions match this filter."}
          </p>
        ) : filter === "jobs" ? (
          <div className="space-y-1.5" data-testid="customer-txn-addresses">
            <p className="text-[10px] text-slate-400 px-0.5 leading-snug">
              Service addresses only. Tap to open a job at that address.
            </p>
            {rows.map((row) => (
              <button
                key={row.address}
                type="button"
                className="w-full text-left rounded-xl border border-slate-100 bg-white px-3 py-2.5 active:bg-slate-50"
                data-testid="cust-txn-addr-row"
                onClick={() => {
                  if (row.jobId) openJob({ jobId: row.jobId });
                }}
              >
                <div className="text-sm font-semibold text-slate-800 truncate">{row.address}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {row.jobCount || 1} job{(row.jobCount || 1) === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="customer-txn-list">
            {rows.map((row) => {
              const testId =
                row.kind === "invoice"
                  ? "cust-txn-inv-" + row.docNo
                  : row.kind === "payment"
                    ? "cust-txn-pay-" + (row.payment?.id || row.id)
                    : row.kind === "estimate"
                      ? "cust-txn-est-" + row.docNo
                      : "cust-txn-" + row.id;
              return (
                <CompactRow
                  key={row.id}
                  row={row}
                  onOpen={openRow}
                  onOpenJob={openJob}
                  testId={testId}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
