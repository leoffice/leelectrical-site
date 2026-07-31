/**
 * Meter application field — four Energy Services options on a Con Ed permit row.
 */
import React from "react";
import {
  METER_APPLICATION_OPTIONS,
  getMeterApplication,
} from "./meterApplication.js";

/**
 * @param {{
 *   job: object,
 *   disabled?: boolean,
 *   onSelect: (value: string) => void
 * }} props
 */
export default function MeterApplicationField({ job, disabled = false, onSelect }) {
  const current = getMeterApplication(job);
  const selected = current?.value || "";

  return (
    <div className="space-y-2" data-testid="meter-application-field">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
        Submit meter application
      </div>
      <div className="grid gap-1.5" role="radiogroup" aria-label="Meter application">
        {METER_APPLICATION_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              data-testid={"meter-app-option-" + opt.value}
              data-value={opt.value}
              onClick={() => onSelect?.(opt.value)}
              className={
                "w-full text-left rounded-xl border px-3 py-2 text-sm font-semibold transition-colors " +
                (active
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300") +
                (disabled ? " opacity-50 pointer-events-none" : "")
              }
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className={
                    "inline-block w-3.5 h-3.5 rounded-full border-2 shrink-0 " +
                    (active ? "border-brand bg-brand" : "border-slate-300")
                  }
                />
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      {current?.label ? (
        <p className="text-[11px] text-slate-500" data-testid="meter-app-recorded">
          Saved: {current.label}
          {current.setAt
            ? " · " + String(current.setAt).slice(0, 10)
            : ""}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">
          Pick one — attaches to this job / Con Ed case
        </p>
      )}
    </div>
  );
}
