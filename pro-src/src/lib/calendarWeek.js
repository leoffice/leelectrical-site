// Work-week calendar helpers — Monday-start, Mon–Fri columns.
import { evStart } from "./format.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Monday 00:00 local for the week containing `date` (Date or YYYY-MM-DD). */
export function mondayOf(date = new Date()) {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mon–Fri dates for the week starting `weekStart` (a Monday). */
export function workWeekDays(weekStart) {
  const start = new Date(weekStart);
  return DAY_NAMES.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { label, date: d, key: ymd(d) };
  });
}

export function weekRangeLabel(weekStart) {
  const days = workWeekDays(weekStart);
  const a = days[0].date;
  const b = days[4].date;
  const fmt = (d) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const y = a.getFullYear() !== b.getFullYear() ? `, ${a.getFullYear()}` : "";
  return `${fmt(a)} – ${fmt(b)}, ${b.getFullYear()}${y}`;
}

/** Short time label from a calendar event start. */
export function evTimeLabel(e) {
  const s = evStart(e);
  if (!s || !s.includes("T")) return "All day";
  const [h, m] = s.slice(11, 16).split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Group events into Mon–Fri buckets for one work week. Skips inspection summaries. */
export function eventsForWorkWeek(events, weekStart) {
  const days = workWeekDays(weekStart);
  const keys = new Set(days.map((d) => d.key));
  const byDay = Object.fromEntries(days.map((d) => [d.key, []]));
  for (const e of events || []) {
    if (/inspection/i.test(e.summary || "")) continue;
    const k = evStart(e).slice(0, 10);
    if (!keys.has(k)) continue;
    byDay[k].push(e);
  }
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => evStart(a).localeCompare(evStart(b)));
  }
  return { days, byDay };
}