// Reminder date/time picker — weekdays only, work hours, month grid.
import { addDays } from "./calendarDue.js";
import { WORK_END, WORK_START, isWeekdayYmd } from "./followUpReminders.js";

export const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Half-hour slots from 9:00 AM through 4:30 PM (last start before 5 PM close). */
export function workHourSlots() {
  const slots = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    for (const m of [0, 30]) {
      if (h === WORK_END - 1 && m === 30) break;
      slots.push({
        hour: h,
        minute: m,
        key: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      });
    }
  }
  return slots;
}

export function formatHourSlot(hour, minute = 0) {
  const ap = hour >= 12 ? "PM" : "AM";
  const hr = hour % 12 || 12;
  const mm = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${hr}${mm} ${ap}`;
}

export function formatDayLong(ymd) {
  const d = new Date(String(ymd) + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function formatMonthYear(year, month) {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Calendar cells for a month — includes leading/trailing days, flags weekends. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, 1 - (startPad - i));
    cells.push(cellFor(d, false));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push(cellFor(d, true));
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push(cellFor(d, false));
  }
  return cells;
}

function cellFor(d, inMonth) {
  const key = ymd(d);
  const dow = d.getDay();
  const weekend = dow === 0 || dow === 6;
  return {
    key,
    date: new Date(d),
    inMonth,
    weekend,
    weekday: !weekend,
    label: d.getDate(),
  };
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDatetime(iso) {
  if (!iso || !iso.includes("T")) return { day: "", hour: WORK_START, minute: 0 };
  const [day, hm] = iso.split("T");
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return { day, hour: Number.isNaN(h) ? WORK_START : h, minute: Number.isNaN(m) ? 0 : m };
}

export function buildDatetime(day, hour, minute = 0) {
  return `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isDaySelectable(ymd, today) {
  if (!ymd || !isWeekdayYmd(ymd)) return false;
  return ymd >= today;
}

export function defaultPickerMonth(iso, today) {
  const { day } = parseDatetime(iso);
  const ref = day || today;
  const d = new Date(ref + "T12:00:00");
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Next selectable weekday on or after `fromYmd`. */
export function nextSelectableDay(fromYmd, today) {
  let d = fromYmd || today;
  for (let i = 0; i < 14; i++) {
    if (isDaySelectable(d, today)) return d;
    d = addDays(d, 1);
  }
  return d;
}