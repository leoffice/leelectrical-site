import React, { useMemo, useState } from "react";
import { fmtUsd } from "../../lib/requisitionData.js";
import { changeOrdersTotal } from "../../lib/requisitionHelpers.js";
import { fmt$ } from "../../lib/format.js";
import { openBalance, invoiceTotal, amountPaid } from "../../lib/customers.js";

function coBalance(co, job) {
  if (job) {
    const due = openBalance(job);
    if (job.paid || due <= 0.01) return 0;
    return due;
  }
  if (co.balance != null && co.balance !== "") {
    const n = parseFloat(String(co.balance).replace(/[$,]/g, ""));
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  if (co.paid) return 0;
  const paid = Number(co.amountPaid) || 0;
  const amt = Number(co.amount) || 0;
  return Math.max(0, amt - paid);
}

function coAmount(co, job) {
  if (job) {
    const t = invoiceTotal(job);
    if (t > 0) return t;
  }
  return Number(co.amount) || 0;
}

export default function ChangeOrdersPanel({ project, onSave, busy, jobs = [] }) {
  const list = project?.changeOrderList || [];
  const total = changeOrdersTotal(project);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [openId, setOpenId] = useState(null);

  const jobsById = useMemo(() => {
    const m = new Map();
    for (const j of jobs || []) if (j?.id) m.set(String(j.id), j);
    return m;
  }, [jobs]);

  const jobsByInvoice = useMemo(() => {
    const m = new Map();
    for (const j of jobs || []) {
      if (j?.invoiceNo) m.set(String(j.invoiceNo).trim(), j);
    }
    return m;
  }, [jobs]);

  const resolveJob = (co) => {
    if (co.jobId && jobsById.has(String(co.jobId))) return jobsById.get(String(co.jobId));
    if (co.invoiceNo && jobsByInvoice.has(String(co.invoiceNo).trim())) {
      return jobsByInvoice.get(String(co.invoiceNo).trim());
    }
    return null;
  };

  const add = async () => {
    const amt = parseFloat(String(amount).replace(/[$,]/g, "")) || 0;
    if (!desc.trim() && !amt) return;
    const co = {
      id: `co-${Date.now()}`,
      description: desc.trim() || "Change order",
      amount: amt,
      balance: amt,
      date: new Date().toISOString().slice(0, 10),
    };
    const next = {
      ...project,
      changeOrderList: [...list, co],
      changeOrders: total + amt,
    };
    await onSave(next);
    setDesc("");
    setAmount("");
  };

  return (
    <div className="space-y-4" data-testid="change-orders-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Change Orders</h2>
        <span className="text-sm font-bold text-slate-800">Total: {fmtUsd(total)}</span>
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        Each change order is linked for attach/submit — not rolled into the progress requisition contract sum. Tap a row for amount, balance, and invoice details.
      </p>

      {list.length ? (
        <div className="space-y-1.5" data-testid="co-panel-list">
          {list.map((co) => {
            const job = resolveJob(co);
            const amt = coAmount(co, job);
            const bal = coBalance(co, job);
            const paid = bal <= 0.01 || !!co.paid || !!job?.paid;
            const open = openId === co.id;
            return (
              <div
                key={co.id}
                className={`card px-3 py-2.5 text-sm ${
                  paid
                    ? "bg-emerald-50 border-emerald-200"
                    : bal > 0
                      ? "bg-red-50 border-red-200"
                      : ""
                } ${open ? "ring-2 ring-brand/30" : ""}`}
                data-testid={`co-panel-row-${co.id}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpenId(open ? null : co.id)}
                  data-testid={`co-panel-toggle-${co.id}`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {co.seq != null ? `Change Order ${co.seq}` : co.description}
                        {co.invoiceNo ? (
                          <span className="font-normal text-slate-500"> · #{co.invoiceNo}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {co.description}
                        {co.date ? ` · ${co.date}` : ""}
                        {co.attachOnly ? " · not on progress app" : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold tabular-nums" data-testid={`co-panel-amount-${co.id}`}>
                        {fmtUsd(amt)}
                      </div>
                      <div
                        className="text-[11px] font-bold tabular-nums text-slate-700 mt-0.5"
                        data-testid={`co-panel-balance-${co.id}`}
                      >
                        Balance {fmtUsd(bal)}
                      </div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wide mt-0.5 opacity-80">
                        {paid ? "Paid" : amountPaid(job || {}) > 0.01 ? "Partial" : "Open"}
                      </div>
                    </div>
                  </div>
                </button>

                {open ? (
                  <div className="mt-2 border-t border-slate-100 pt-2 space-y-2" data-testid={`co-panel-detail-${co.id}`}>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {co.invoiceNo ? (
                        <>
                          <dt className="text-slate-500 font-semibold">Invoice</dt>
                          <dd className="text-right font-semibold">#{co.invoiceNo}</dd>
                        </>
                      ) : null}
                      <dt className="text-slate-500 font-semibold">Amount</dt>
                      <dd className="text-right font-bold tabular-nums">{fmtUsd(amt)}</dd>
                      <dt className="text-slate-500 font-semibold">Balance</dt>
                      <dd className="text-right font-bold tabular-nums text-brand">{fmtUsd(bal)}</dd>
                      {job && amountPaid(job) > 0 ? (
                        <>
                          <dt className="text-slate-500 font-semibold">Paid</dt>
                          <dd className="text-right font-semibold tabular-nums">{fmt$(amountPaid(job))}</dd>
                        </>
                      ) : null}
                      <dt className="text-slate-500 font-semibold">On requisition</dt>
                      <dd className="text-right font-semibold">
                        {co.attachOnly ? "Attach only (not in SOV math)" : "Reference"}
                      </dd>
                    </dl>
                    {(job?.invoiceLines || job?.estimateLines || []).length ? (
                      <ul className="space-y-1 text-xs text-slate-600">
                        {(job.invoiceLines || job.estimateLines).map((ln, i) => {
                          const lineAmt =
                            ln.amount != null
                              ? Number(ln.amount)
                              : (Number(ln.qty) || 1) * (Number(ln.unitPrice) || 0);
                          return (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="min-w-0 flex-1 break-words">
                                {ln.description || ln.itemName || "Line"}
                              </span>
                              {lineAmt > 0 ? (
                                <span className="shrink-0 tabular-nums font-semibold">{fmt$(lineAmt)}</span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {job?.id ? (
                      <a
                        href={`#/job/${encodeURIComponent(job.id)}?doc=invoice&edit=1`}
                        className="inline-block text-xs font-bold text-white bg-brand rounded-lg px-3 py-1.5"
                        data-testid={`co-panel-view-inv-${co.id}`}
                      >
                        View invoice
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No change orders yet — add one if the contract sum changed.</p>
      )}

      <div className="card px-4 py-3 space-y-2">
        <div className="text-sm font-bold text-slate-700">Add change order</div>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          data-testid="co-desc"
        />
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-testid="co-amount"
        />
        <button type="button" className="btn w-full" onClick={add} disabled={busy}>
          Add change order
        </button>
      </div>
    </div>
  );
}
