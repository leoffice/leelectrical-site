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