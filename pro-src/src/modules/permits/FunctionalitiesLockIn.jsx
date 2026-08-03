/**
 * Visible "FUNCTIONALITIES TO LOCK IN" checklist inside the Permits tab.
 * Scale shows learned / total for what's working (Levi 2026-08-03).
 */
import React, { useMemo, useState } from "react";
import {
  LEARNED_SKILLS_REMOVED,
  functionalitiesLockInSeed,
  isLockInDone,
  lockInDoneCount,
  lockInProgressPct,
  lockInRemainingCount,
  lockInTotalCount,
} from "./functionalitiesLockIn.js";

export default function FunctionalitiesLockIn() {
  // Only remaining skills — learned ones are gone from the board (clean slate).
  const items = useMemo(() => functionalitiesLockInSeed(), []);
  const remaining = lockInRemainingCount(items);
  const learned = lockInDoneCount();
  const total = lockInTotalCount();
  const pct = lockInProgressPct();
  // Levi: the skill list wastes space — collapsed by default so the to-do
  // list stays the visible thing on the Permits tab.
  const [open, setOpen] = useState(false);

  if (!items.length && !learned) return null;

  return (
    <section
      className="card overflow-hidden"
      data-testid="functionalities-lock-in"
      aria-labelledby="functionalities-lock-in-title"
    >
      <button
        type="button"
        className="w-full px-4 py-3 border-b border-slate-100 bg-slate-50/80 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="functionalities-lock-in-toggle"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2
              id="functionalities-lock-in-title"
              className="font-extrabold text-sm text-slate-900 uppercase tracking-wide"
            >
              Paperwork skills
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {learned} working · {remaining} still to teach
            </p>
            {/* Scale — what's working */}
            <div
              className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden max-w-[14rem]"
              data-testid="functionalities-lock-in-scale"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${learned} of ${total} skills working`}
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${pct}%` }}
                data-testid="functionalities-lock-in-scale-fill"
              />
            </div>
            <p
              className="text-[10px] font-bold text-emerald-800 mt-1"
              data-testid="functionalities-lock-in-scale-label"
            >
              {learned}/{total} working ({pct}%)
            </p>
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className="pill bg-slate-200 text-slate-700 text-[10px] font-bold"
              data-testid="functionalities-lock-in-count"
            >
              {remaining} left
            </span>
            <span
              className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            >
              ›
            </span>
          </span>
        </div>
      </button>
      {open ? (
        <>
          {LEARNED_SKILLS_REMOVED.length ? (
            <div
              className="px-4 py-2 bg-emerald-50/50 border-b border-emerald-100"
              data-testid="functionalities-lock-in-working"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 mb-1">
                Working
              </div>
              <ul className="space-y-0.5">
                {LEARNED_SKILLS_REMOVED.map((s) => (
                  <li
                    key={s.id}
                    className="text-xs text-emerald-900 flex items-start gap-1.5"
                    data-testid="functionalities-lock-in-working-item"
                  >
                    <span className="text-emerald-600 font-bold shrink-0">✓</span>
                    <span>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="divide-y divide-slate-100" data-testid="functionalities-lock-in-list">
            {items.map((item) => {
              const doneItem = isLockInDone(item);
              return (
                <li
                  key={item.id}
                  className={
                    "px-4 py-2.5 flex items-start gap-2.5 " +
                    (doneItem ? "bg-emerald-50/40" : "")
                  }
                  data-testid="functionalities-lock-in-item"
                  data-id={item.id}
                  data-status={item.status}
                >
                  <span
                    className={
                      "mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-md text-[11px] font-bold shrink-0 " +
                      (doneItem
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-400 border border-slate-200")
                    }
                    aria-hidden
                  >
                    {doneItem ? "✓" : item.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        "text-sm font-semibold " +
                        (doneItem
                          ? "text-emerald-900 line-through decoration-emerald-300"
                          : "text-slate-800")
                      }
                    >
                      {item.title}
                    </div>
                    {item.notes ? (
                      <div className="text-[11px] text-slate-500 mt-0.5">{item.notes}</div>
                    ) : null}
                  </div>
                  <span
                    className={
                      "text-[10px] font-bold uppercase shrink-0 px-1.5 py-0.5 rounded-full " +
                      (doneItem
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-50 text-amber-800")
                    }
                  >
                    {doneItem ? "Done" : "To teach"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
