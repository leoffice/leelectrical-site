// Two-step reminder picker — pick a weekday, then a work-hour slot.
import React, { useMemo, useState } from "react";
import { todayStr } from "../lib/format.js";
import {
  WEEKDAY_HEADERS,
  buildDatetime,
  defaultPickerMonth,
  formatDayLong,
  formatHourSlot,
  formatMonthYear,
  isDaySelectable,
  monthGrid,
  parseDatetime,
  workHourSlots,
} from "../lib/reminderPicker.js";

export default function ReminderDateTimePicker({ value, onChange, minDate }) {
  const today = minDate || todayStr();
  const parsed = parseDatetime(value);
  const [step, setStep] = useState("day");
  const [view, setView] = useState(() => defaultPickerMonth(value, today));
  const slots = useMemo(() => workHourSlots(), []);

  const pickDay = (key) => {
    if (!isDaySelectable(key, today)) return;
    const { hour, minute } = parseDatetime(value);
    onChange(buildDatetime(key, hour, minute));
    setStep("hours");
  };

  const pickHour = (hour, minute) => {
    const day = parsed.day || today;
    onChange(buildDatetime(day, hour, minute));
  };

  const goBackToDay = () => setStep("day");

  const shiftMonth = (delta) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const cells = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);

  if (step === "hours" && parsed.day) {
    const { hour: selH, minute: selM } = parsed;
    return (
      <div data-testid="reminder-hour-step">
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3 mb-3 text-left active:bg-brand-soft/60"
          onClick={goBackToDay}
          aria-label="Change day"
          data-testid="reminder-change-day"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-brand">Day</span>
          <span className="font-bold text-slate-900">{formatDayLong(parsed.day)}</span>
          <span className="text-brand text-sm font-bold">Change ›</span>
        </button>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Pick a time — work hours only</p>
        <div className="grid grid-cols-3 gap-2">
          {slots.map(({ hour, minute, key }) => {
            const active = selH === hour && selM === minute;
            return (
              <button
                key={key}
                type="button"
                className={`rounded-xl border py-2.5 text-sm font-bold ${
                  active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"
                }`}
                onClick={() => pickHour(hour, minute)}
                data-testid={`reminder-hour-${key}`}
              >
                {formatHourSlot(hour, minute)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="reminder-day-step">
      <div className="flex items-center gap-2 mb-3">
        <button type="button" className="btn-ghost !py-1.5 !px-2 text-lg" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <div className="flex-1 text-center text-sm font-bold text-slate-800">{formatMonthYear(view.year, view.month)}</div>
        <button type="button" className="btn-ghost !py-1.5 !px-2 text-lg" aria-label="Next month" onClick={() => shiftMonth(1)}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className={`text-center text-[10px] font-bold py-1 ${h === "Sat" || h === "Sun" ? "text-slate-300" : "text-slate-400"}`}>
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const selectable = cell.inMonth && isDaySelectable(cell.key, today);
          const isWeekend = cell.weekend;
          const isToday = cell.key === today;
          const selected = parsed.day === cell.key;
          let cls = "rounded-lg py-2 text-sm font-bold ";
          if (!cell.inMonth) cls += "text-transparent pointer-events-none ";
          else if (isWeekend) cls += "text-slate-300 bg-slate-50 cursor-not-allowed ";
          else if (!selectable) cls += "text-slate-300 cursor-not-allowed ";
          else if (selected) cls += "bg-brand text-white ";
          else if (isToday) cls += "border border-brand/40 text-brand bg-brand-soft/30 active:bg-brand-soft/50 ";
          else cls += "text-slate-700 bg-white border border-slate-100 active:bg-slate-50 ";
          return (
            <button
              key={cell.key + (cell.inMonth ? "" : "-pad")}
              type="button"
              className={cls}
              disabled={!selectable}
              onClick={() => pickDay(cell.key)}
              data-testid={selectable ? `reminder-day-${cell.key}` : undefined}
              aria-label={isWeekend ? `${cell.label} — weekend` : `Select ${cell.key}`}
            >
              {cell.inMonth ? cell.label : ""}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-2">Sat &amp; Sun are grayed out — weekdays only</p>
    </div>
  );
}