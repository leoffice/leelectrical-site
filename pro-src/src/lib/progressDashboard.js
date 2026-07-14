// Dev Progress dashboard API — serves dev_progress_data.json shape from /.netlify/functions/progress.
import { functionsBase as base } from "./functionsBase.js";

const cb = () => "cb=" + Date.now();

export async function fetchProgress({ refresh = false } = {}) {
  const url = `${base()}/progress?${cb()}`;
  const res = await fetch(url, {
    method: refresh ? "POST" : "GET",
    cache: "no-store",
    headers: refresh ? { "content-type": "application/json" } : undefined,
    body: refresh ? JSON.stringify({ op: "refresh" }) : undefined,
  });
  if (!res.ok) throw new Error("progress: HTTP " + res.status);
  const doc = await res.json();
  if (doc.meta && doc.totals) return doc;
  throw new Error("progress: unexpected shape");
}

export function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return v >= 1000 ? "$" + v.toLocaleString() : "$" + v;
}

export function fmtUpdated(ts) {
  if (!ts) return "not yet";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return "Today " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}