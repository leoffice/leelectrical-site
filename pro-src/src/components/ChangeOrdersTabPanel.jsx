// Change Orders tab — list by line, expand details, edit like a regular invoice.
import React, { useMemo, useState } from "react";
import {
  canAddChangeOrder,
  changeOrderTabRows,
  changeOrderTabRowsAll,
} from "../lib/changeOrder.js";
import { fmt$ } from "../lib/format.js";

const ROW =
  "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors active:opacity-90";

function statusTone(row) {
  if (row.paid || row.statusLabel === "Paid") return "bg-emerald-50 border-emerald-200 text-emerald-900";
  if (row.statusLabel === "Partial") return "bg-amber-50 border-amber-200 text-amber-900";
  if (row.statusLabel === "On invoice") return "bg-sky-50 border-sky-200 text-sky-900";
  return "bg-red-50 border-red-200 text-red-900";
}

function LineDetail({ lines }) {
  if (!lines?.length) {
    return <p className="text-xs text-slate-400 mt-2">No line details on file yet.</p>;
  }
  return (
    <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
      {lines.map((ln, i) => {
        const desc = String(ln.description || ln.itemName || "Line").trim();
        const amt =
          ln.amount != null
            ? Number(ln.amount)
            : (Number(ln.qty) || 1) * (Number(ln.unitPrice) || 0);
        return (
          <li key={i} className="text-xs text-slate-600 flex gap-2 justify-between">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{desc}</span>
            {amt > 0 ? <span className="shrink-0 tabular-nums font-semibold text-slate-800">{fmt$(amt)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function ChangeOrdersTabPanel({
  jobs,
  sourceJob,
  rows: rowsProp,
  scope = "source", // "source" | "all"
  onAdd,
  onEdit,
  onOpenJob,
  canAdd = true,
}) {
  const rows = useMemo(() => {
    if (rowsProp) return rowsProp;
    if (scope === "all") return changeOrderTabRowsAll(jobs);
    return changeOrderTabRows(jobs, sourceJob);
  }, [rowsProp, scope, jobs, sourceJob]);
  const [openId, setOpenId] = useState(null);
  const allowAdd = canAdd && sourceJob && canAddChangeOrder(jobs, sourceJob);

  return (
    <div className="card px-3 py-3 space-y-2" data-testid="change-orders-tab-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
          Change Orders {rows.length ? `(${rows.length})` : ""}
        </h3>
        {onAdd ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-brand px-2 py-1 rounded-lg border border-brand/30 bg-brand-soft disabled:opacity-40"
            disabled={!allowAdd}
            onClick={onAdd}
            data-testid="co-tab-add"
          >
            ＋ Add change order
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        Separate invoices numbered Change Order 1, 2, … for this job. Tap a row for details; Edit opens the invoice editor.
      </p>

      {!rows.length ? (
        <p className="text-xs text-slate-400 text-center py-4" data-testid="co-tab-empty">
          No change orders on file yet. Add one to create the next number as its own invoice.
        </p>
      ) : (
        <div className="space-y-1.5" data-testid="co-tab-list">
          {rows.map((row) => {
            const open = openId === row.id;
            return (
              <div
                key={row.id}
                className={`${ROW} ${statusTone(row)} ${open ? "ring-2 ring-brand/30" : ""}`}
                data-testid={"co-tab-row-" + row.seq}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpenId(open ? null : row.id)}
                  data-testid={"co-tab-toggle-" + row.seq}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-[13px]">
                        {row.label}
                        {row.docNo ? (
                          <span className="font-semibold opacity-70"> · #{row.docNo}</span>
                        ) : null}
                      </span>
                      {row.description ? (
                        <span className="block text-[11px] font-normal opacity-85 mt-0.5 line-clamp-2">
                          {row.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-xs font-bold tabular-nums" data-testid={"co-tab-amount-" + row.seq}>
                        {row.amountLine || (row.amount > 0 ? fmt$(row.amount) : "—")}
                      </span>
                      <span
                        className="block text-[11px] font-bold tabular-nums mt-0.5 opacity-90"
                        data-testid={"co-tab-balance-" + row.seq}
                      >
                        {row.balanceLine ||
                          (row.paid
                            ? "Balance $0"
                            : row.balance != null
                              ? "Balance " + fmt$(row.balance)
                              : "")}
                      </span>
                      <span className="block text-[10px] font-extrabold uppercase tracking-wide mt-0.5 opacity-80">
                        {row.statusLabel}
                      </span>
                    </span>
                  </div>
                </button>

                {open ? (
                  <div className="mt-2 space-y-2" data-testid={"co-tab-detail-" + row.seq}>
                    {row.kind === "line" && row.parentInvoiceNo ? (
                      <p className="text-[11px] text-slate-500 mb-1">
                        On invoice #{row.parentInvoiceNo} (extra work billed on the original)
                      </p>
                    ) : null}
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-slate-100 pt-2">
                      {row.docNo ? (
                        <>
                          <dt className="text-slate-500 font-semibold">Invoice</dt>
                          <dd className="text-right font-semibold text-slate-800">#{row.docNo}</dd>
                        </>
                      ) : null}
                      <dt className="text-slate-500 font-semibold">Amount</dt>
                      <dd className="text-right font-bold tabular-nums text-slate-900">
                        {row.amount > 0 ? fmt$(row.amount) : "—"}
                      </dd>
                      <dt className="text-slate-500 font-semibold">Balance</dt>
                      <dd className="text-right font-bold tabular-nums text-brand">
                        {row.paid || (row.balance != null && row.balance <= 0.01)
                          ? fmt$(0)
                          : row.balance != null
                            ? fmt$(row.balance)
                            : "—"}
                      </dd>
                      <dt className="text-slate-500 font-semibold">Status</dt>
                      <dd className="text-right font-semibold">{row.statusLabel}</dd>
                    </dl>
                    <LineDetail lines={row.lines} />
                    <div className="flex flex-wrap gap-2 mt-1">
                      {onEdit ? (
                        <button
                          type="button"
                          className="text-xs font-bold text-white bg-brand rounded-lg px-3 py-1.5 active:opacity-80"
                          onClick={() => onEdit(row)}
                          data-testid={"co-tab-edit-" + row.seq}
                        >
                          ✏️ View invoice
                        </button>
                      ) : null}
                      {onOpenJob && row.jobId !== sourceJob?.id ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-brand border border-brand/30 rounded-lg px-3 py-1.5 bg-white"
                          onClick={() => onOpenJob(row.job)}
                          data-testid={"co-tab-open-" + row.seq}
                        >
                          Open job ›
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
