// Open invoices at the same service address — below job info, tap to open.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoiceButtonLabel, invoiceButtonTone } from "../lib/customerDocLists.js";

const ROW_BTN =
  "w-full flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 text-red-800 px-3 py-2.5 text-left text-sm font-semibold mb-1.5 active:opacity-80";

export default function AddressOpenInvoices({ jobs, activeJobId, fromCust = "" }) {
  const nav = useNavigate();
  const [expanded, setExpanded] = useState(true);

  const openList = (jobs || []).filter((j) => j?.invoiceNo && invoiceButtonTone(j) === "open");
  if (!openList.length) return null;

  const openJob = (j) => {
    const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
    nav("/job/" + j.id + q);
  };

  return (
    <div className="card overflow-hidden" data-testid="address-open-invoices">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="address-open-invoices-toggle"
      >
        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex-1">
          Open invoices at this address ({openList.length})
        </span>
        <span className={`text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
      </button>
      {expanded ? (
        <div className="px-3 pb-2.5 border-t border-slate-100 pt-2">
          {openList.map((j) => {
            const { no, amt } = invoiceButtonLabel(j);
            const active = j.id === activeJobId;
            return (
              <button
                key={j.id}
                type="button"
                className={`${ROW_BTN} ${active ? "ring-2 ring-brand/40" : ""}`}
                onClick={() => openJob(j)}
                data-testid={"addr-open-inv-" + no}
              >
                <span>
                  Invoice #{no}
                  {j.title ? <span className="block text-[10px] font-normal opacity-80 truncate">{j.title}</span> : null}
                </span>
                <span className="text-xs tabular-nums shrink-0">{amt}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}