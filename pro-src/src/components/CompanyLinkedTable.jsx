// Company dashboard detail rows — tap opens invoice/estimate, double-tap opens job info.
import React from "react";
import { useNavigate } from "react-router-dom";
import { useDoubleTap } from "../lib/useDoubleTap.js";

function jobPath(jobId, doc) {
  const base = "/job/" + encodeURIComponent(jobId);
  if (doc === "invoice") return base + "?doc=invoice";
  if (doc === "estimate") return base + "?doc=estimate";
  return base;
}

export default function CompanyLinkedTable({ title, cols, rows, align, total, foot, linkMeta }) {
  const nav = useNavigate();

  const onRow = useDoubleTap({
    onSingle: (meta) => {
      if (!meta?.jobId) return;
      nav(jobPath(meta.jobId, meta.doc || "invoice"));
    },
    onDouble: (meta) => {
      if (!meta?.jobId) return;
      nav(jobPath(meta.jobId, null));
    },
  });

  return (
    <div data-testid="company-linked-table">
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
          {rows.map((r, ri) => {
            const meta = linkMeta?.[ri];
            const clickable = !!meta?.jobId;
            return (
              <tr
                key={ri}
                className={clickable ? "cursor-pointer hover:bg-slate-50 active:bg-slate-100" : ""}
                onClick={clickable ? () => onRow(meta) : undefined}
                data-testid={clickable ? "company-linked-row" : undefined}
                title={clickable ? "Tap invoice/estimate · double-tap job info" : undefined}
              >
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
            );
          })}
        </tbody>
      </table>
      {total ? (
        <div className="flex justify-between text-[13px] font-extrabold pt-2 mt-1 border-t-2 border-slate-200">
          <span>{total[0]}</span>
          <span>{total[1]}</span>
        </div>
      ) : null}
      {foot ? <div className="text-[11.5px] text-slate-500 mt-2 italic">{foot}</div> : null}
      {linkMeta?.some((m) => m?.jobId) ? (
        <div className="text-[10px] text-slate-400 mt-2">Tap a row for the invoice or estimate · double-tap for full job info</div>
      ) : null}
    </div>
  );
}