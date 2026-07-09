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

const ROLE_HEADER = {
  parent: "border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300/80",
  sub: "border-amber-700 bg-amber-100 text-amber-950 ring-1 ring-amber-600/50",
};

function roleBadge(role) {
  if (role === "parent") {
    return (
      <span className="block text-[9px] font-bold uppercase tracking-wide text-emerald-700 mt-0.5">
        Parent company
      </span>
    );
  }
  if (role === "sub") {
    return (
      <span className="block text-[9px] font-bold uppercase tracking-wide text-amber-900 mt-0.5">
        Sub company
      </span>
    );
  }
  return null;
}

function CompareHeaderCell({ title, role, interactive, onTap, testId }) {
  const base =
    "px-2 py-2 border-l border-slate-200 break-words text-left w-full " +
    (interactive ? "cursor-pointer active:opacity-80 transition-colors rounded-t-lg " : "");

  if (!interactive) {
    return (
      <div className={base + "text-slate-700"} data-testid={testId}>
        {title}
      </div>
    );
  }

  const roleClass = role ? ROLE_HEADER[role] : "text-slate-700 bg-white hover:bg-slate-50";

  return (
    <button
      type="button"
      className={base + roleClass}
      onClick={onTap}
      data-testid={testId}
      aria-label={role === "parent" ? title + " — parent company, tap to swap" : title + " — tap to set as parent"}
    >
      <span className="block font-semibold">{title}</span>
      {roleBadge(role)}
    </button>
  );
}

export default function SideBySideCompare({
  leftTitle,
  rightTitle,
  rows,
  testId,
  leftRole = null,
  rightRole = null,
  onTapLeft,
  onTapRight,
  interactive = false,
}) {
  const marked = markDifferences(rows);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/80 overflow-hidden text-xs"
      data-testid={testId}
    >
      <div className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <div className="px-2 py-2" />
        <CompareHeaderCell
          title={leftTitle}
          role={interactive ? leftRole : null}
          interactive={interactive}
          onTap={onTapLeft}
          testId={testId + "-col-left"}
        />
        <CompareHeaderCell
          title={rightTitle}
          role={interactive ? rightRole : null}
          interactive={interactive}
          onTap={onTapRight}
          testId={testId + "-col-right"}
        />
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
              (interactive && leftRole === "parent"
                ? "bg-emerald-50/40 "
                : interactive && leftRole === "sub"
                  ? "bg-amber-50/50 "
                  : "") +
              (differ ? "text-amber-950 bg-amber-50/70" : "text-slate-800")
            }
          >
            {left}
          </div>
          <div
            className={
              "px-2 py-2 border-l border-slate-100 break-words whitespace-pre-wrap " +
              (interactive && rightRole === "parent"
                ? "bg-emerald-50/40 "
                : interactive && rightRole === "sub"
                  ? "bg-amber-50/50 "
                  : "") +
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