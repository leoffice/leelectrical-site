import React from "react";
import { Link } from "react-router-dom";
import { currentStage, isPaid, nextAction, progressPct } from "../lib/stages.js";

export function StagePill({ job }) {
  const cur = currentStage(job);
  if (!cur)
    return <span className="pill bg-emerald-100 text-emerald-700">Complete</span>;
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

export default function JobCard({ job, compact }) {
  const pct = progressPct(job);
  return (
    <Link to={`/job/${encodeURIComponent(job.id)}`} className="block card px-4 py-3.5 active:scale-[0.99] transition-transform">
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
          <div className="font-bold text-slate-900">{job.amount || "—"}</div>
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
        <span className="text-xs text-slate-500 truncate ml-auto max-w-[55%]">→ {nextAction(job)}</span>
      </div>
    </Link>
  );
}
