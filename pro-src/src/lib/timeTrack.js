// Time tracking helpers — durations, labels, employee identity on device.

export const EMPLOYEE_KEY = "lepro_employee_id";

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#4f46e5"];

export function employeeColor(index) {
  return COLORS[Math.abs(index) % COLORS.length];
}

export function loadEmployeeId() {
  try {
    return localStorage.getItem(EMPLOYEE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveEmployeeId(id) {
  try {
    if (id) localStorage.setItem(EMPLOYEE_KEY, id);
    else localStorage.removeItem(EMPLOYEE_KEY);
  } catch {
    /* ignore */
  }
}

/** Milliseconds since session started (live ticker). */
export function elapsedMs(startedAt, now = Date.now()) {
  if (!startedAt) return 0;
  return Math.max(0, now - startedAt);
}

/** Human duration — 2h 15m, 45m, 5s. */
export function fmtDuration(ms) {
  const n = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Clock time for a timestamp — 9:05 AM. */
export function fmtClock(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Date label — Today, Yesterday, or Mon Jul 7. */
export function fmtDay(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const same = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function jobTimeLabel(job) {
  if (!job) return "";
  const cust = job.customer || job.businessName || "Job";
  const title = job.title ? ` — ${job.title}` : "";
  return cust + title;
}

/** Entries grouped by calendar day (newest day first). */
export function groupEntriesByDay(entries) {
  const map = new Map();
  for (const e of entries || []) {
    const key = fmtDay(e.endedAt || e.startedAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()];
}

/** Sunday 00:00 local for the week containing ts. */
export function startOfWeek(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function endOfWeek(weekStart) {
  return weekStart + 7 * 86400000 - 1;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Filter entries by employee, job, and time range. */
export function filterEntries(entries, { employeeId, jobId, fromMs, toMs } = {}) {
  return (entries || []).filter((e) => {
    if (employeeId && e.employeeId !== employeeId) return false;
    if (jobId && e.jobId !== jobId) return false;
    const end = e.endedAt || e.startedAt || 0;
    if (fromMs && end < fromMs) return false;
    if (toMs && (e.startedAt || 0) > toMs) return false;
    return true;
  });
}

/** Total logged ms for a job. */
export function sumMsForJob(entries, jobId) {
  if (!jobId) return 0;
  return filterEntries(entries, { jobId }).reduce((n, e) => n + (e.durationMs || 0), 0);
}

/** Per-employee day totals for a pay week (Sun–Sat). */
export function buildWeekGrid(entries, employees, weekStart) {
  const end = weekStart + 7 * 86400000;
  const rows = (employees || []).map((emp) => {
    const days = Array(7).fill(0);
    let weekMs = 0;
    for (const e of entries || []) {
      if (e.employeeId !== emp.id) continue;
      const t = e.startedAt || e.endedAt || 0;
      if (t < weekStart || t >= end) continue;
      const di = new Date(t).getDay();
      const ms = e.durationMs || 0;
      days[di] += ms;
      weekMs += ms;
    }
    return { employee: emp, days, weekMs };
  });
  return { labels: DAY_LABELS, rows };
}

/** datetime-local value for an input from epoch ms. */
export function toLocalInput(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local back to epoch ms. */
export function fromLocalInput(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Who is live (active session with heartbeat in last 2 min). */
export function liveEmployees(active, employees, now = Date.now()) {
  const out = [];
  for (const emp of employees || []) {
    const sess = active && active[emp.id];
    if (!sess) continue;
    const seen = sess.lastSeen || sess.startedAt || 0;
    out.push({
      ...emp,
      session: sess,
      live: now - seen < 120000,
      elapsed: elapsedMs(sess.startedAt, now),
    });
  }
  return out.sort((a, b) => (b.session.startedAt || 0) - (a.session.startedAt || 0));
}