// Shared formatting helpers — kept identical in behavior to app/sleek.html.

export function parseAmount(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function fmt$(v) {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? String(v) : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ago(ts) {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Calendar events may carry start as a string or a {dateTime|date} object. */
export function evStart(e) {
  const s = e && e.start;
  if (!s) return "";
  if (typeof s === "string") return s;
  return s.dateTime || s.date || "";
}
