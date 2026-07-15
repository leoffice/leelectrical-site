import React, { useState } from "react";
import { fmtUsd } from "../../lib/requisitionData.js";
import { overallPct } from "../../lib/requisitionCalc.js";
import { paymentStatusLabel, requisitionBalance } from "../../lib/requisitionHelpers.js";

export default function RequisitionsCard({ project, onSelect, selectedId }) {
  const [open, setOpen] = useState(true);
  const reqs = [...(project?.requisitions || [])].sort((a, b) => (b.num || 0) - (a.num || 0));
  const pct = overallPct(project?.items);

  if (!reqs.length) {
    return (
      <div className="card px-4 py-3" data-testid="requisitions-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Requisitions</h2>
          <span className="text-xs text-slate-400">{pct}% done · none yet</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">Generate your first requisition from the SOV below.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden" data-testid="requisitions-card">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Requisitions</h2>
        <span className="text-xs text-slate-500">
          {reqs.length} submitted · {pct}% done {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="border-t divide-y">
          {reqs.map((r) => {
            const bal = requisitionBalance(r);
            const pay = paymentStatusLabel(r);
            const active = selectedId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${active ? "bg-brand/5" : ""}`}
                onClick={() => onSelect?.(r.id)}
                data-testid={`req-card-${r.num}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-slate-900">{r.applicationNumber || `REQ-${r.num}`}</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      r.status === "submitted" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status === "submitted" ? "Submitted" : "Generated"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                  <span>Requesting</span>
                  <span className="text-right font-semibold text-slate-800">{fmtUsd(r.currentPaymentDue)}</span>
                  <span>Balance</span>
                  <span className="text-right font-semibold text-brand">{fmtUsd(bal)}</span>
                  <span>Payment</span>
                  <span className="text-right">{pay}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}