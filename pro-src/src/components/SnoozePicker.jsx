// Snooze controls — quick presets + slider up to 5 hours.
import React, { useState } from "react";
import {
  SNOOZE_PRESETS,
  SNOOZE_SLIDER_MAX,
  SNOOZE_SLIDER_MIN,
  SNOOZE_SLIDER_STEP,
  formatSnoozeDuration,
} from "../lib/followUpReminders.js";

export default function SnoozePicker({ onSnooze, label, compact = false }) {
  const [sliderMin, setSliderMin] = useState(90);

  const apply = (minutes) => {
    onSnooze && onSnooze(minutes);
  };

  return (
    <div data-testid="snooze-picker">
      {label ? (
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{label}</p>
      ) : null}
      <div className={`grid gap-2 mb-3 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
        {SNOOZE_PRESETS.map(({ minutes, label: presetLabel }) => (
          <button
            key={minutes}
            type="button"
            className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 active:bg-slate-50"
            onClick={() => apply(minutes)}
            data-testid={`snooze-preset-${minutes}`}
          >
            {presetLabel}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-semibold text-slate-700">Custom</span>
          <span className="text-slate-500" data-testid="snooze-slider-label">
            {formatSnoozeDuration(sliderMin)}
          </span>
        </div>
        <input
          type="range"
          className="w-full accent-brand"
          min={SNOOZE_SLIDER_MIN}
          max={SNOOZE_SLIDER_MAX}
          step={SNOOZE_SLIDER_STEP}
          value={sliderMin}
          onChange={(e) => setSliderMin(parseInt(e.target.value, 10))}
          aria-label="Snooze duration"
          data-testid="snooze-slider"
        />
        <button
          type="button"
          className="btn bg-amber-100 text-amber-900 w-full mt-3"
          onClick={() => apply(sliderMin)}
          data-testid="snooze-slider-apply"
        >
          Snooze {formatSnoozeDuration(sliderMin)}
        </button>
      </div>
    </div>
  );
}