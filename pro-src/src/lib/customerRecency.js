// Tracks when Levi last opened or edited a customer — drives the Active tab sort.
import { clientKey, normalizeCustomer } from "./customers.js";

export const RECENCY_KEY = "lepro_customer_recency_v1";
const MAX_ENTRIES = 400;

const recencyListeners = new Set();
let recencyRevision = 0;

/** In-memory cache — Active-tab sort compares hundreds of customers and used to
 *  re-parse localStorage on every comparison (multi-second freezes on open/type). */
let cachedMap = null;

/** Bump when recency changes so the customer list can re-sort without remounting. */
export function getRecencyRevision() {
  return recencyRevision;
}

export function subscribeRecency(listener) {
  recencyListeners.add(listener);
  return () => recencyListeners.delete(listener);
}

function notifyRecency() {
  recencyRevision += 1;
  for (const fn of recencyListeners) {
    try {
      fn(recencyRevision);
    } catch {}
  }
}

function loadMap() {
  if (cachedMap) return cachedMap;
  try {
    const raw = localStorage.getItem(RECENCY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cachedMap = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    cachedMap = {};
  }
  return cachedMap;
}

function saveMap(map) {
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (map[b] || 0) - (map[a] || 0))
      .slice(MAX_ENTRIES)
      .forEach((k) => delete map[k]);
  }
  cachedMap = map;
  try {
    localStorage.setItem(RECENCY_KEY, JSON.stringify(map));
  } catch {}
}

/** Test helper — drop the in-memory cache so the next read hits storage. */
export function _resetRecencyCacheForTests() {
  cachedMap = null;
}

/** All board keys that refer to the same customer (q:/c:/g: aliases). */
export function recencyAliasKeys(key, jobs = []) {
  const keys = new Set();
  const k = String(key || "").trim();
  if (k) keys.add(k);
  for (const j of jobs || []) {
    if (!j) continue;
    keys.add(clientKey(j));
    const n = normalizeCustomer(j.customer || j.businessName);
    if (n) keys.add("c:" + n);
    const qid = String(j.qboCustomerId || "").trim();
    if (qid) keys.add("q:" + qid);
    if (j.clientGroup) keys.add("g:" + j.clientGroup);
  }
  return [...keys];
}

/** Record that a customer board key was opened or edited just now. */
export function touchCustomer(key, jobs = []) {
  const aliases = recencyAliasKeys(key, jobs);
  if (!aliases.length) return;
  const map = loadMap();
  const now = Date.now();
  let changed = false;
  for (const k of aliases) {
    if (map[k] !== now) {
      map[k] = now;
      changed = true;
    }
  }
  if (!changed) return;
  saveMap(map);
  notifyRecency();
}

/** Record recency for a job's customer group. */
export function touchCustomerJob(job) {
  if (!job) return;
  touchCustomer(clientKey(job), [job]);
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

/** Best recency timestamp — max of explicit touches (incl. aliases) and job activity. */
export function customerRecencyTs(key, jobs = []) {
  const map = loadMap();
  let best = 0;
  for (const k of recencyAliasKeys(key, jobs)) {
    if (map[k]) best = Math.max(best, map[k]);
  }
  for (const j of jobs || []) {
    best = Math.max(best, jobActivityTs(j));
  }
  return best;
}

export function compareCustomerRecency(keyA, jobsA, keyB, jobsB) {
  return customerRecencyTs(keyB, jobsB) - customerRecencyTs(keyA, jobsA);
}