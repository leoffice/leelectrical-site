// Invoices / Estimates tabs — open + closed sections; tap invoice → job info (folded).
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  invoiceJobs,
  estimateJobs,
  estimateButtonLabel,
  invoiceRowDetail,
} from "../lib/customerDocLists.js";
import { DeleteConfirmSheet } from "./JobSheets.jsx";
import { deleteDocLabel } from "../lib/deleteDoc.js";
import { useStore } from "../state/store.jsx";

const TAB_BTN =
  "flex-1 rounded-xl border px-2 py-2 text-center text-[10px] font-bold leading-tight transition-colors";
const DOC_BTN =
  "w-full flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold mb-1.5 active:opacity-80";
const SECTION_HDR =
  "text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-0.5 mb-1.5 mt-2 first:mt-0";

function toneClass(tone) {
  if (tone === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (tone === "open") return "bg-red-50 text-red-800 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function isOpenEstimate(job) {
  return !!(job?.estimateNo && !job.invoiceNo && !job._estimateConfirmed);
}

function DocSection({ title, empty, children }) {
  return (
    <div data-testid={"cust-section-" + title.toLowerCase().replace(/\s+/g, "-")}>
      <p className={SECTION_HDR}>{title}</p>
      {children}
      {empty ? <p className="text-xs text-slate-400 text-center py-2">None on file.</p> : null}
    </div>
  );
}

function InvoiceRows({ list, activeJobId, fromCust, onOpen, onDeleteRequest }) {
  if (!list.length) return null;
  return list.map((j) => {
    const { no, address, amountLine, tone } = invoiceRowDetail(j);
    const active = j.id === activeJobId;
    return (
      <div key={j.id} className="flex items-stretch gap-1 mb-1.5">
        <button
          type="button"
          className={`${DOC_BTN} !mb-0 flex-1 min-w-0 ${toneClass(tone)} ${active ? "ring-2 ring-brand/40" : ""}`}
          onClick={() => onOpen(j)}
          data-testid={"cust-inv-" + no}
        >
          <span className="min-w-0 flex-1">
            <span className="block">Invoice #{no}</span>
            {address ? (
              <span className="block text-[11px] font-normal opacity-85 truncate mt-0.5">{address}</span>
            ) : null}
          </span>
          <span className="text-xs tabular-nums shrink-0 text-right leading-snug">{amountLine}</span>
        </button>
        {onDeleteRequest ? (
          <button
            type="button"
            className="shrink-0 w-9 rounded-xl border border-slate-200 bg-white text-slate-400 text-sm active:bg-red-50 active:text-red-600 active:border-red-200"
            aria-label={"Remove invoice #" + no}
            data-testid={"cust-inv-del-" + no}
            onClick={() => onDeleteRequest(j)}
          >
            🗑
          </button>
        ) : null}
      </div>
    );
  });
}

function EstimateRows({ list, activeJobId, onOpen, onDeleteRequest }) {
  if (!list.length) return null;
  return list.map((j) => {
    const { no, linked } = estimateButtonLabel(j);
    const active = j.id === activeJobId;
    const open = isOpenEstimate(j);
    return (
      <div key={j.id} className="flex items-stretch gap-1 mb-1.5">
        <button
          type="button"
          className={`${DOC_BTN} !mb-0 flex-1 min-w-0 ${
            open ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
          } ${active ? "ring-2 ring-brand/40" : ""}`}
          onClick={() => onOpen(j)}
          data-testid={"cust-est-" + no}
        >
          <span>
            Estimate #{no}
            {linked ? <span className="text-xs text-slate-400 font-normal">{linked}</span> : null}
          </span>
        </button>
        {onDeleteRequest ? (
          <button
            type="button"
            className="shrink-0 w-9 rounded-xl border border-slate-200 bg-white text-slate-400 text-sm active:bg-red-50 active:text-red-600 active:border-red-200"
            aria-label={"Remove estimate #" + no}
            data-testid={"cust-est-del-" + no}
            onClick={() => onDeleteRequest(j)}
          >
            🗑
          </button>
        ) : null}
      </div>
    );
  });
}

export default function CustomerDocTabs({ jobs, activeJobId, fromCust = "" }) {
  const nav = useNavigate();
  const { patchAndSave, showToast } = useStore();
  const [tab, setTab] = useState(null); // null = collapsed, or 'invoices'|'estimates'
  const [deleteJob, setDeleteJob] = useState(null);

  const allInv = invoiceJobs(jobs);
  const openInv = allInv.filter((j) => invoiceRowDetail(j).tone === "open");
  const closedInv = allInv.filter((j) => invoiceRowDetail(j).tone === "paid");

  const allEst = estimateJobs(jobs);
  const openEst = allEst.filter(isOpenEstimate);
  const closedEst = allEst.filter((j) => !isOpenEstimate(j));

  const counts = { invoices: allInv.length, estimates: allEst.length };

  const openJob = (j) => {
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    parts.push("fold=1");
    const q = parts.length ? "?" + parts.join("&") : "";
    nav("/job/" + j.id + q);
  };

  const toggle = (t) => setTab((cur) => (cur === t ? null : t));

  const requestDelete = (j) => setDeleteJob(j);
  const confirmDelete = async () => {
    if (!deleteJob) return;
    await patchAndSave(deleteJob.id, { _deleted: true });
    showToast("Removed from app");
    setDeleteJob(null);
  };

  return (
    <div className="space-y-2" data-testid="customer-doc-tabs">
      <div className="flex gap-1.5 px-0.5">
        {[
          ["invoices", "🧾 Invoices", counts.invoices],
          ["estimates", "📝 Estimates", counts.estimates],
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

      {tab === "invoices" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-invoices">
          <DocSection title="Open invoices" empty={!openInv.length}>
            <InvoiceRows list={openInv} activeJobId={activeJobId} fromCust={fromCust} onOpen={openJob} onDeleteRequest={requestDelete} />
          </DocSection>
          <DocSection title="Closed invoices" empty={!closedInv.length}>
            <InvoiceRows list={closedInv} activeJobId={activeJobId} fromCust={fromCust} onOpen={openJob} onDeleteRequest={requestDelete} />
          </DocSection>
        </div>
      ) : null}

      {tab === "estimates" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-estimates">
          <DocSection title="Open estimates" empty={!openEst.length}>
            <EstimateRows list={openEst} activeJobId={activeJobId} onOpen={openJob} onDeleteRequest={requestDelete} />
          </DocSection>
          <DocSection title="Closed estimates" empty={!closedEst.length}>
            <EstimateRows list={closedEst} activeJobId={activeJobId} onOpen={openJob} onDeleteRequest={requestDelete} />
          </DocSection>
        </div>
      ) : null}

      {deleteJob ? (
        <DeleteConfirmSheet
          title={"Remove " + deleteDocLabel(deleteJob) + "?"}
          note="Hides this job from your dashboard. QuickBooks stays unchanged."
          confirmLabel="Remove"
          onClose={() => setDeleteJob(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}