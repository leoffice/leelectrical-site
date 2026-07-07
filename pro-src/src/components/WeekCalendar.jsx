// Mon–Fri work-week grid with swipe (or arrows) to change weeks.
import React, { useMemo, useRef, useState } from "react";
import { eventsForWorkWeek, evTimeLabel, mondayOf, weekRangeLabel, ymd } from "../lib/calendarWeek.js";
import { todayStr } from "../lib/format.js";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";

export default function WeekCalendar({ events, onPickEvent }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [addDay, setAddDay] = useState(null);
  const touchX = useRef(null);

  const weekStart = useMemo(() => {
    const m = mondayOf();
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const { days, byDay } = useMemo(() => eventsForWorkWeek(events, weekStart), [events, weekStart]);
  const today = todayStr();
  const isCurrentWeek = weekOffset === 0;

  const shift = (delta) => setWeekOffset((w) => w + delta);

  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 55) shift(-1);
    else if (dx < -55) shift(1);
  };

  return (
    <div data-testid="week-calendar">
      <div className="flex items-center gap-2 mb-2 px-1">
        <button
          type="button"
          className="btn-ghost !py-1.5 !px-2 text-lg"
          aria-label="Previous week"
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-bold text-slate-800">{weekRangeLabel(weekStart)}</div>
          {isCurrentWeek ? (
            <div className="text-[10px] font-semibold text-brand uppercase tracking-wide">This week</div>
          ) : (
            <button type="button" className="text-[10px] font-semibold text-brand" onClick={() => setWeekOffset(0)}>
              Jump to this week
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn-ghost !py-1.5 !px-2 text-lg"
          aria-label="Next week"
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>

      <p className="text-[10px] text-slate-400 text-center mb-2 px-2">Swipe right for last week · left for next</p>

      <div
        className="overflow-x-auto -mx-1 px-1 pb-1"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid grid-cols-5 gap-1.5 min-w-[340px]">
          {days.map(({ label, date, key }) => {
            const isToday = key === today;
            const list = byDay[key] || [];
            return (
              <div
                key={key}
                className={`rounded-xl border flex flex-col min-h-[140px] ${
                  isToday ? "border-brand bg-brand-soft/30" : "border-slate-200 bg-white"
                }`}
                data-testid={`week-day-${key}`}
              >
                <div className={`text-center py-1.5 border-b text-[11px] font-bold ${isToday ? "border-brand/30 text-brand" : "border-slate-100 text-slate-600"}`}>
                  <div>{label}</div>
                  <div className="text-[10px] font-semibold opacity-80">{date.getDate()}</div>
                </div>
                <div className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[200px]">
                  {list.length ? (
                    list.map((e, i) => (
                      <button
                        key={e.id || i}
                        type="button"
                        className="w-full text-left rounded-lg bg-white border border-slate-100 px-1.5 py-1 shadow-sm active:bg-slate-50"
                        onClick={() => onPickEvent && onPickEvent(e)}
                      >
                        <div className="text-[10px] font-bold text-slate-800 leading-tight line-clamp-2">
                          {e.summary || "Appointment"}
                        </div>
                        <div className="text-[9px] text-slate-400">{evTimeLabel(e)}</div>
                      </button>
                    ))
                  ) : (
                    <div className="text-[9px] text-slate-300 text-center py-2">—</div>
                  )}
                </div>
                <button
                  type="button"
                  className="text-[10px] font-bold text-brand py-1.5 border-t border-slate-100 hover:bg-slate-50"
                  aria-label={`Add appointment on ${label}`}
                  onClick={() => setAddDay(key)}
                >
                  ＋
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="btn bg-brand-soft text-brand w-full mt-3 !py-2.5"
        onClick={() => setAddDay(today)}
      >
        ＋ Add appointment
      </button>

      {addDay && <AddAppointmentSheet defaultDate={addDay} onClose={() => setAddDay(null)} />}
    </div>
  );
}