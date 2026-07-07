// Choose how to create an invoice — new or from existing estimate.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";

export function ProgressPctSheet({ title, hint, defaultPct = 50, onConfirm, onClose }) {
  const [pct, setPct] = React.useState(String(defaultPct));
  return (
    <Sheet title={title || "Progress billing"} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {hint || "What percentage of the estimate should this invoice bill?"}
      </p>
      <div className="flex items-center gap-3 mb-4">
        <input
          className="input flex-1"
          inputMode="numeric"
          min={1}
          max={100}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          aria-label="Progress percent"
          data-testid="progress-pct-input"
        />
        <span className="text-sm font-bold text-slate-600">%</span>
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={Math.min(100, Math.max(1, parseInt(pct, 10) || 50))}
        onChange={(e) => setPct(e.target.value)}
        className="w-full mb-4"
        aria-label="Progress percent slider"
      />
      <button
        type="button"
        className="btn-brand w-full"
        onClick={() => onConfirm(Math.min(100, Math.max(1, parseInt(pct, 10) || 50)))}
        data-testid="progress-pct-confirm"
      >
        Continue
      </button>
    </Sheet>
  );
}

export default function InvoiceCreateSheet({ job, onClose, onPick }) {
  const hasEstimate = !!(job.estimateNo || (job.estimateLines && job.estimateLines.length));
  return (
    <Sheet title="Create invoice" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">Start a new invoice or bill from the estimate on this job.</p>
      <Opt icon="＋" title="New invoice" note="Blank line items — pre-filled address from job" onClick={() => onPick({ mode: "new" })} />
      {hasEstimate ? (
        <Opt
          icon="📝"
          title={job.estimateNo ? "From estimate #" + job.estimateNo : "From estimate on this job"}
          note="Copies line items — you'll pick a progress %"
          onClick={() => onPick({ mode: "from_estimate" })}
        />
      ) : (
        <p className="text-[11px] text-slate-400 text-center mt-2">Generate an estimate first to use “From estimate”.</p>
      )}
    </Sheet>
  );
}