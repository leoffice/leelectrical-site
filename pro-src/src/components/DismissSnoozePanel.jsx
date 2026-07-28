// The panel every ✕ opens: pick when this suggestion comes back.
// See lib/dismissSnooze.js for why closing is a snooze, not a dismiss.
import React, { useState } from "react";
import {
  DISMISS_SNOOZE_DEFAULT,
  DISMISS_SNOOZE_MAX,
  DISMISS_SNOOZE_MIN,
  DISMISS_SNOOZE_PRESETS,
  DISMISS_SNOOZE_STEP,
  formatSnoozeMinutes,
} from "../lib/dismissSnooze.js";

/**
 * @param {object} props
 * @param {(minutes: number) => void} props.onSnooze
 * @param {() => void} [props.onCancel] — back to the card
 * @param {() => void} [props.onDismiss] — "don't remind me" escape hatch
 * @param {string} [props.lead]
 */
export default function DismissSnoozePanel({ onSnooze, onCancel, onDismiss, lead }) {
  const [minutes, setMinutes] = useState(DISMISS_SNOOZE_DEFAULT);

  return (
    <div data-testid="dismiss-snooze-panel">
      <p className="text-sm text-slate-600 mb-3">
        {lead || "Closing this is a “not now” — when should it come back?"}
      </p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {DISMISS_SNOOZE_PRESETS.map(({ minutes: m, label }) => (
          <button
            key={m}
            type="button"
            className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 active:bg-slate-50"
            onClick={() => onSnooze && onSnooze(m)}
            data-testid={`dismiss-snooze-preset-${m}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-semibold text-slate-700">Remind me in</span>
          <span className="text-slate-500" data-testid="dismiss-snooze-label">
            {formatSnoozeMinutes(minutes)}
          </span>
        </div>
        <input
          type="range"
          className="w-full accent-brand"
          min={DISMISS_SNOOZE_MIN}
          max={DISMISS_SNOOZE_MAX}
          step={DISMISS_SNOOZE_STEP}
          value={minutes}
          onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
          aria-label="Remind me later — how long"
          data-testid="dismiss-snooze-slider"
        />
        <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-0.5 px-0.5">
          <span>5 min</span>
          <span>5 hours</span>
        </div>
        <button
          type="button"
          className="btn bg-amber-100 text-amber-900 w-full mt-3"
          onClick={() => onSnooze && onSnooze(minutes)}
          data-testid="dismiss-snooze-apply"
        >
          Remind me in {formatSnoozeMinutes(minutes)}
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {onCancel ? (
          <button
            type="button"
            className="btn bg-slate-100 text-slate-800 flex-1"
            onClick={onCancel}
            data-testid="dismiss-snooze-cancel"
          >
            Back
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="btn-ghost flex-1 text-slate-500"
            onClick={onDismiss}
            data-testid="dismiss-snooze-never"
          >
            Don&apos;t remind me
          </button>
        ) : null}
      </div>
    </div>
  );
}
