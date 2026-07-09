// Invoices / Estimates / Payments tabs — expandable lists between customer and job info.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  invoiceJobs,
  estimateJobs,
  paymentRows,
  invoiceButtonLabel,
  estimateButtonLabel,
  paymentButtonLabel,
} from "../lib/customerDocLists.js";

const TAB_BTN =
  "flex-1 rounded-xl border px-2 py-2 text-center text-[10px] font-bold leading-tight transition-colors";
const DOC_BTN =
  "w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold mb-1.5 active:opacity-80";

function toneClass(tone) {
  if (tone === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (tone === "open") return "bg-red-50 text-red-800 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function CustomerDocTabs({
  jobs,
  activeJobId,
  fromCust = "",
  openOnly = false,
  onOpenOnlyChange,
}) {
  const nav = useNavigate();
  const [tab, setTab] = useState(null); // null = collapsed, or 'invoices'|'estimates'|'payments'

  const invList = invoiceJobs(jobs, { openOnly });
  const estList = estimateJobs(jobs, { openOnly });
  const payList = paymentRows(jobs, { openOnly });

  const counts = { invoices: invList.length, estimates: estList.length, payments: payList.length };

  const openJob = (j) => {
    const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
    nav("/job/" + j.id + q);
  };

  const toggle = (t) => setTab((cur) => (cur === t ? null : t));

  return (
    <div className="space-y-2" data-testid="customer-doc-tabs">
      <div className="flex items-center gap-2 px-0.5">
        <div className="flex gap-1.5 flex-1 min-w-0">
          {[
            ["invoices", "🧾 Invoices", counts.invoices],
            ["estimates", "📝 Estimates", counts.estimates],
            ["payments", "💳 Payments", counts.payments],
          ].map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              className={`${TAB_BTN} ${
                tab === id ? "bg-brand-soft text-brand border-brand/30" : "bg-slate-50 text-slate-500 border-slate-200"
              }`}
              onClick={() => toggle(id)}
              data-testid={"cust-tab-" + id}
            >
              {label}
              {n > 0 ? <span className="block text-[9px] font-semibold opacity-70">{n}</span> : null}
            </button>
          ))}
        </div>
        {onOpenOnlyChange ? (
          <button
            type="button"
            className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ${
              openOnly ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
            onClick={() => onOpenOnlyChange(!openOnly)}
            data-testid="cust-tab-open-toggle"
            aria-pressed={openOnly}
          >
            {openOnly ? "Open" : "All"}
          </button>
        ) : null}
      </div>

      {tab === "invoices" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-invoices">
          {invList.length ? (
            invList.map((j) => {
              const { no, amt, tone } = invoiceButtonLabel(j);
              const active = j.id === activeJobId;
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`${DOC_BTN} ${toneClass(tone)} ${active ? "ring-2 ring-brand/40" : ""}`}
                  onClick={() => openJob(j)}
                  data-testid={"cust-inv-" + no}
                >
                  <span>Invoice #{no}</span>
                  <span className="text-xs tabular-nums shrink-0">{amt}</span>
                </button>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 text-center py-3">No {openOnly ? "open " : ""}invoices on file.</p>
          )}
        </div>
      ) : null}

      {tab === "estimates" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-estimates">
          {estList.length ? (
            estList.map((j) => {
              const { no, linked } = estimateButtonLabel(j);
              const active = j.id === activeJobId;
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`${DOC_BTN} bg-slate-50 text-slate-700 border-slate-200 ${active ? "ring-2 ring-brand/40" : ""}`}
                  onClick={() => openJob(j)}
                  data-testid={"cust-est-" + no}
                >
                  <span>
                    Estimate #{no}
                    {linked ? <span className="text-xs text-slate-400 font-normal">{linked}</span> : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 text-center py-3">No {openOnly ? "open " : ""}estimates on file.</p>
          )}
        </div>
      ) : null}

      {tab === "payments" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-payments">
          {payList.length ? (
            payList.map((row, i) => {
              const { amt, method, date, inv } = paymentButtonLabel(row);
              return (
                <button
                  key={row.job.id + "-" + i}
                  type="button"
                  className={`${DOC_BTN} bg-emerald-50 text-emerald-800 border-emerald-200`}
                  onClick={() => openJob(row.job)}
                  data-testid={"cust-pay-" + i}
                >
                  <span className="min-w-0 truncate">
                    {amt} · {method}
                    <span className="block text-[10px] font-normal opacity-80 truncate">
                      {inv}
                      {date ? " · " + date : ""}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 text-center py-3">No payments recorded yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}