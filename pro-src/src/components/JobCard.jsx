import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { isPaid, nextAction, progressPct, stageOf } from "../lib/stages.js";
import { fmtAmountDue } from "../lib/customers.js";

export function StagePill({ job }) {
  const cur = stageOf(job);
  const tone =
    {
      Lead: "bg-sky-100 text-sky-700",
      "Site Visit": "bg-sky-100 text-sky-700",
      Estimate: "bg-amber-100 text-amber-700",
      Accepted: "bg-amber-100 text-amber-700",
      Invoiced: "bg-violet-100 text-violet-700",
      "Deposit Receipt": "bg-violet-100 text-violet-700",
      Paperwork: "bg-slate-200 text-slate-700",
      Scheduled: "bg-brand-soft text-brand",
      Done: "bg-emerald-100 text-emerald-700",
      "Follow-up": "bg-orange-100 text-orange-700",
      Paid: "bg-emerald-100 text-emerald-700",
    }[cur] || "bg-slate-100 text-slate-600";
  return <span className={`pill ${tone}`}>{cur}</span>;
}

export function PaidPill({ job }) {
  return isPaid(job) ? (
    <span className="pill bg-emerald-500 text-white">Paid ✓</span>
  ) : (
    <span className="pill bg-slate-100 text-slate-500">Unpaid</span>
  );
}

export default function JobCard({ job, compact, stackN, onQuickSend, onMarkPaid }) {
  const pct = progressPct(job);
  const nav = useNavigate();
  const href = `/job/${encodeURIComponent(job.id)}`;
  return (
    <Link to={href} className="block card px-4 py-3.5 active:scale-[0.99] transition-transform relative">
      {stackN ? (
        <span className="absolute -top-2 right-3 pill bg-accent text-white shadow">{stackN} jobs</span>
      ) : null}
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          {!compact && (
            <div className="font-bold text-slate-900 truncate">{job.customer || "(no customer)"}</div>
          )}
          <div className={`truncate ${compact ? "font-semibold text-slate-900" : "text-sm text-slate-500"}`}>
            {job.title || "(untitled job)"}
          </div>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="font-bold text-slate-900">{fmtAmountDue(job) || "—"}</div>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <StagePill job={job} />
        <PaidPill job={job} />
        <span className="text-xs text-slate-500 truncate ml-auto max-w-[55%]">{nextAction(job)}</span>
      </div>
      {(onQuickSend || onMarkPaid) && (
        <div
          className="mt-2.5 flex gap-1.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {job.phone && (
            <a href={`tel:${job.phone}`} className="flex-1 text-center text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5">
              📞 Call
            </a>
          )}
          {job.invoiceNo && !job.paid && onQuickSend && (
            <button className="flex-1 text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5" onClick={() => onQuickSend(job)}>
              📤 Invoice
            </button>
          )}
          {!job.paid && onMarkPaid && (
            <button className="flex-1 text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5" onClick={() => onMarkPaid(job)}>
              💵 Paid?
            </button>
          )}
          <button className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg py-1.5" onClick={() => nav(href)}>
            Open ›
          </button>
        </div>
      )}
    </Link>
  );
}
