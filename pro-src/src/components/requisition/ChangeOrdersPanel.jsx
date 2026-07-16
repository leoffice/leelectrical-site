import React, { useState } from "react";
import { fmtUsd } from "../../lib/requisitionData.js";
import { changeOrdersTotal } from "../../lib/requisitionHelpers.js";

export default function ChangeOrdersPanel({ project, onSave, busy }) {
  const list = project?.changeOrderList || [];
  const total = changeOrdersTotal(project);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  const add = async () => {
    const amt = parseFloat(String(amount).replace(/[$,]/g, "")) || 0;
    if (!desc.trim() && !amt) return;
    const co = { id: `co-${Date.now()}`, description: desc.trim() || "Change order", amount: amt, date: new Date().toISOString().slice(0, 10) };
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

      {list.length ? (
        <div className="card divide-y">
          {list.map((co) => (
            <div key={co.id} className="px-4 py-3 flex justify-between gap-2 text-sm">
              <div>
                <div className="font-semibold">
                  {co.invoiceNo ? `Inv #${co.invoiceNo} · ` : ""}
                  {co.seq != null ? `CO ${co.seq}` : co.description}
                </div>
                <div className="text-xs text-slate-400">
                  {co.description}
                  {co.date ? ` · ${co.date}` : ""}
                  {co.attachOnly ? " · invoice (not on progress app)" : ""}
                </div>
              </div>
              <span className="font-bold tabular-nums">{fmtUsd(co.amount)}</span>
            </div>
          ))}
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