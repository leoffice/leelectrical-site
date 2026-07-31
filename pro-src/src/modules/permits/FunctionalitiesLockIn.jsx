/**
 * Visible "FUNCTIONALITIES TO LOCK IN" checklist inside the Permits tab.
 */
import React, { useMemo } from "react";
import {
  functionalitiesLockInSeed,
  isLockInDone,
  lockInDoneCount,
  lockInTotalCount,
} from "./functionalitiesLockIn.js";

export default function FunctionalitiesLockIn() {
  const items = useMemo(() => functionalitiesLockInSeed(), []);
  const done = lockInDoneCount(items);
  const total = lockInTotalCount(items);

  return (
    <section
      className="card overflow-hidden"
      data-testid="functionalities-lock-in"
      aria-labelledby="functionalities-lock-in-title"
    >
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="functionalities-lock-in-title"
              className="font-extrabold text-sm text-slate-900 uppercase tracking-wide"
            >
              Functionalities to lock in
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Con Ed sub-workflows — checked off as each ships
            </p>
          </div>
          <span
            className="pill bg-slate-200 text-slate-700 text-[10px] font-bold shrink-0"
            data-testid="functionalities-lock-in-count"
          >
            {done}/{total} live
          </span>
        </div>
      </div>
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
                    (doneItem ? "text-emerald-900 line-through decoration-emerald-300" : "text-slate-800")
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
                {doneItem ? "Done" : "To build"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
