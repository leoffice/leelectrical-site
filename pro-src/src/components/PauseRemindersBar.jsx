// Global pause — snooze every reminder popup for a few minutes.
import React, { useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  PAUSE_PRESETS,
  PAUSE_SLIDER_MAX,
  PAUSE_SLIDER_MIN,
  PAUSE_SLIDER_STEP,
  clearRemindersPause,
  formatSnoozeDuration,
  isRemindersPaused,
  pauseAllReminders,
  remindersPausedUntil,
} from "../lib/followUpReminders.js";

export default function PauseRemindersBar() {
  const { showToast } = useStore();
  const [open, setOpen] = useState(false);
  const [sliderMin, setSliderMin] = useState(15);
  const [paused, setPaused] = useState(() => isRemindersPaused());
  const [untilLabel, setUntilLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const until = remindersPausedUntil();
      setPaused(!!until);
      if (until) {
        setUntilLabel(
          until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        );
      } else {
        setUntilLabel("");
      }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, []);

  const applyPause = (minutes) => {
    pauseAllReminders(minutes);
    setPaused(true);
    setUntilLabel(
      remindersPausedUntil()?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) || ""
    );
    showToast("Reminders paused for " + formatSnoozeDuration(minutes));
    setOpen(false);
  };

  const resume = () => {
    clearRemindersPause();
    setPaused(false);
    setUntilLabel("");
    showToast("Reminders are back on");
    setOpen(false);
  };

  return (
    <>
      <div
        className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        data-testid="pause-reminders-bar"
      >
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800">
            {paused ? "Reminders paused" : "Reminders"}
          </div>
          {paused && untilLabel ? (
            <div className="text-xs text-amber-700">Until {untilLabel}</div>
          ) : (
            <div className="text-xs text-slate-500">Pop-ups and pings</div>
          )}
        </div>
        {paused ? (
          <button
            type="button"
            className="btn bg-emerald-100 text-emerald-800 !py-1.5 !px-3 text-sm shrink-0"
            onClick={resume}
            data-testid="resume-reminders-btn"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="btn bg-amber-100 text-amber-900 !py-1.5 !px-3 text-sm shrink-0"
            onClick={() => setOpen(true)}
            data-testid="pause-reminders-btn"
          >
            Pause
          </button>
        )}
      </div>

      {open ? (
        <Sheet title="Pause reminders" onClose={() => setOpen(false)}>
          <p className="text-sm text-slate-500 mb-4">
            Hides every reminder popup for a bit — your list in the Reminders tab stays put.
          </p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {PAUSE_PRESETS.map(({ minutes, label }) => (
              <button
                key={minutes}
                type="button"
                className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700"
                onClick={() => applyPause(minutes)}
                data-testid={"pause-preset-" + minutes}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
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
              aria-label="Pause duration"
              data-testid="pause-slider"
            />
            <button
              type="button"
              className="btn bg-amber-100 text-amber-900 w-full mt-3"
              onClick={() => applyPause(sliderMin)}
              data-testid="pause-slider-apply"
            >
              Pause {formatSnoozeDuration(sliderMin)}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}