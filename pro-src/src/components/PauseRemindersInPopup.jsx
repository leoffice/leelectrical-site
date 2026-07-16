// Pause ALL reminder popups — lives inside the reminder sheet (page is covered).
import React, { useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  PAUSE_PRESETS,
  PAUSE_SLIDER_MAX,
  PAUSE_SLIDER_MIN,
  PAUSE_SLIDER_STEP,
  formatSnoozeDuration,
  pauseAllReminders,
} from "../lib/followUpReminders.js";

/**
 * Compact global-pause control for the top of a reminder popup.
 * Label sits above the action button; pausing affects every reminder, not only the open one.
 */
export default function PauseRemindersInPopup({ onPaused }) {
  const { showToast } = useStore();
  const [open, setOpen] = useState(false);
  const [sliderMin, setSliderMin] = useState(15);

  const applyPause = (minutes) => {
    pauseAllReminders(minutes);
    showToast("All reminders paused for " + formatSnoozeDuration(minutes));
    setOpen(false);
    onPaused && onPaused(minutes);
  };

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-4"
      data-testid="pause-reminders-in-popup"
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wide text-amber-800/80 mb-2"
        data-testid="pause-reminders-label"
      >
        Pause Reminders
      </p>
      {!open ? (
        <button
          type="button"
          className="btn bg-amber-100 text-amber-900 w-full !py-2.5 text-sm font-bold border border-amber-200"
          onClick={() => setOpen(true)}
          data-testid="pause-reminders-popup-btn"
        >
          Pause all reminders
        </button>
      ) : (
        <div data-testid="pause-reminders-popup-picker">
          <p className="text-xs text-amber-900/80 mb-3">
            Hides every reminder popup for a bit — not just this one.
          </p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PAUSE_PRESETS.map(({ minutes, label }) => (
              <button
                key={minutes}
                type="button"
                className="rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-bold text-amber-900"
                onClick={() => applyPause(minutes)}
                data-testid={"pause-popup-preset-" + minutes}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-amber-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700">Custom</span>
              <span className="text-slate-500">{formatSnoozeDuration(sliderMin)}</span>
            </div>
            <input
              type="range"
              className="w-full accent-brand"
              min={PAUSE_SLIDER_MIN}
              max={PAUSE_SLIDER_MAX}
              step={PAUSE_SLIDER_STEP}
              value={sliderMin}
              onChange={(e) => setSliderMin(parseInt(e.target.value, 10))}
              aria-label="Pause all reminders duration"
              data-testid="pause-popup-slider"
            />
            <button
              type="button"
              className="btn bg-amber-100 text-amber-900 w-full mt-3"
              onClick={() => applyPause(sliderMin)}
              data-testid="pause-popup-slider-apply"
            >
              Pause all {formatSnoozeDuration(sliderMin)}
            </button>
          </div>
          <button
            type="button"
            className="btn-ghost w-full mt-2 text-slate-600 text-sm"
            onClick={() => setOpen(false)}
            data-testid="pause-popup-cancel"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
