// Tracks when Levi last opened a customer — drives the Active tab sort order.
import { clientKey } from "./customers.js";

export const RECENCY_KEY = "lepro_customer_recency_v1";
const MAX_ENTRIES = 400;

function loadMap() {
  try {
    const raw = localStorage.getItem(RECENCY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(map) {
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (map[b] || 0) - (map[a] || 0))
      .slice(MAX_ENTRIES)
      .forEach((k) => delete map[k]);
  }
  try {
    localStorage.setItem(RECENCY_KEY, JSON.stringify(map));
  } catch {}
}

/** Record that a customer board key was opened just now. */
export function touchCustomer(key) {
  const k = String(key || "").trim();
  if (!k) return;
  const map = loadMap();
  map[k] = Date.now();
  saveMap(map);
}

/** Record recency for a job's customer group. */
export function touchCustomerJob(job) {
  if (!job) return;
  touchCustomer(clientKey(job));
}

function jobActivityTs(job) {
  const u = job?.updatedAt || job?.createdAt;
  if (typeof u === "number" && u > 0) return u;
  if (typeof u === "string") {
    const t = Date.parse(u);
    if (!Number.isNaN(t)) return t;
  }
  const m = /^local-(\d+)$/.exec(String(job?.id || ""));
  if (m) return Number(m[1]);
  return 0;
}

/** Best recency timestamp for a board key — explicit touch, else latest job activity. */
export function customerRecencyTs(key, jobs = []) {
  const k = String(key || "").trim();
  const touched = loadMap()[k];
  if (touched) return touched;
  let best = 0;
  for (const j of jobs || []) {
    best = Math.max(best, jobActivityTs(j));
  }
  return best;
}

export function compareCustomerRecency(keyA, jobsA, keyB, jobsB) {
  return customerRecencyTs(keyB, jobsB) - customerRecencyTs(keyA, jobsA);
}