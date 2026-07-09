// Row-by-row A|B comparison for duplicate prompts.
import React from "react";

const DASH = "—";

export function markDifferences(rows) {
  return rows.map(({ label, left, right }) => {
    const l = String(left || "").trim();
    const r = String(right || "").trim();
    const differ = Boolean(l && r && l !== r);
    return {
      label,
      left: left || DASH,
      right: right || DASH,
      differ,
    };
  });
}

export default function SideBySideCompare({ leftTitle, rightTitle, rows, testId }) {
  const marked = markDifferences(rows);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/80 overflow-hidden text-xs"
      data-testid={testId}
    >
      <div className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <div className="px-2 py-2" />
        <div className="px-2 py-2 border-l border-slate-200 text-slate-700 break-words">{leftTitle}</div>
        <div className="px-2 py-2 border-l border-slate-200 text-slate-700 break-words">{rightTitle}</div>
      </div>
      {marked.map(({ label, left, right, differ }) => (
        <div
          key={label}
          className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-slate-100 last:border-0"
          data-testid={"compare-row-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        >
          <div className="px-2 py-2 font-bold text-[10px] uppercase tracking-wide text-slate-500 bg-slate-50/60">
            {label}
          </div>
          <div
            className={
              "px-2 py-2 border-l border-slate-100 break-words whitespace-pre-wrap " +
              (differ ? "text-amber-950 bg-amber-50/70" : "text-slate-800")
            }
          >
            {left}
          </div>
          <div
            className={
              "px-2 py-2 border-l border-slate-100 break-words whitespace-pre-wrap " +
              (differ ? "text-amber-950 bg-amber-50/70" : "text-slate-800")
            }
          >
            {right}
          </div>
        </div>
      ))}
    </div>
  );
}