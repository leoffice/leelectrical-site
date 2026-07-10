// Expandable dashboard card — matches approved Company / Dev Progress mockup pattern.
import React, { useState } from "react";

const ACCENT = {
  green: "border-t-green-500",
  amber: "border-t-amber-500",
  red: "border-t-red-500",
  blue: "border-t-blue-500",
  purple: "border-t-purple-500",
  grey: "border-t-slate-400",
};

export function DeltaBadge({ val, prev, goodUp = true }) {
  if (prev === 0 && val === 0) return <span className="badge-flat inline-block text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">– 0%</span>;
  const diff = val - prev;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const fav = dir === "flat" ? "flat" : (dir === "up") === goodUp ? "fav" : "unfav";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  const pct = prev === 0 ? 100 : Math.abs((diff / prev) * 100);
  const cls =
    fav === "fav"
      ? "bg-emerald-50 text-emerald-700"
      : fav === "unfav"
        ? "bg-red-50 text-red-700"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-block text-xs font-extrabold px-1.5 py-0.5 rounded-full ${cls}`}>
      {arrow} {pct.toFixed(0)}%
    </span>
  );
}

export function DetailTable({ title, cols, rows, align, total, foot }) {
  return (
    <div>
      {title ? <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold mb-2">{title}</div> : null}
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                className={`text-left text-[10.5px] uppercase tracking-wide text-slate-400 font-extrabold pb-1.5 border-b border-slate-200 ${
                  align?.[i] === "r" ? "text-right pr-0" : ""
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-1.5 border-b border-dashed border-slate-100 align-top ${
                    align?.[ci] === "r" ? "text-right font-extrabold tabular-nums pr-0" : ci === 0 ? "font-bold text-slate-900" : ""
                  }`}
                  dangerouslySetInnerHTML={typeof cell === "string" && cell.includes("<") ? { __html: cell } : undefined}
                >
                  {typeof cell !== "string" || !cell.includes("<") ? cell : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total ? (
        <div className="flex justify-between text-[13px] font-extrabold pt-2 mt-1 border-t-2 border-slate-200">
          <span>{total[0]}</span>
          <span>{total[1]}</span>
        </div>
      ) : null}
      {foot ? <div className="text-[11.5px] text-slate-500 mt-2 italic">{foot}</div> : null}
    </div>
  );
}

export default function DashboardWidget({
  id,
  accent = "grey",
  head,
  detail,
  layout = "default",
  testId,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const layoutCls =
    layout === "arow"
      ? "flex items-center gap-2.5"
      : layout === "brow"
        ? "flex items-center gap-4 flex-wrap"
        : "";
  return (
    <div
      data-testid={testId || `widget-${id}`}
      className={`bg-white border border-slate-200 rounded-[14px] shadow-sm overflow-hidden border-t-[3px] ${ACCENT[accent] || ACCENT.grey} ${className}`}
    >
      <button
        type="button"
        className={`w-full text-left px-3 py-2.5 relative hover:bg-slate-50 active:bg-slate-50 ${layoutCls}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className={layout === "arow" ? "flex-1 min-w-0" : layout === "brow" ? "flex-none" : ""}>{head}</div>
        <span className={`absolute top-2.5 right-2.5 text-slate-400 text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && detail ? (
        <div className="border-t border-slate-100 bg-[#fbfcfd] px-3 py-3 max-h-[70vh] overflow-y-auto">{detail}</div>
      ) : null}
    </div>
  );
}

export function WidgetGrid({ widgets, sectionClass = "" }) {
  const visible = widgets.filter((w) => w.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <div className={sectionClass} data-testid="widget-grid">
      {visible.map((w) => (
        <div key={w.id} className={w.gridClass || ""} style={w.gridStyle}>
          {w.render()}
        </div>
      ))}
    </div>
  );
}