/**
 * Learn typical additional-load patterns from completed questionnaires.
 *
 * Stored on job.paperwork.coned.loadLearningHistory (per job) and a device-global
 * bag (localStorage) so the next job's Add Load form gets smarter over time.
 * Prefill uses the most recent similar fills (same building type + unit count).
 */

import {
  loadItemKw,
  matchCatalogId,
  normalizeLoadRow,
  resolveLoadEntryMode,
  sumLoadKw,
} from "./loadItemCatalog.js";

const MAX_ENTRIES = 40;
const GLOBAL_LS_KEY = "le_pro_coned_load_learning_v1";

/** In-memory fallback when localStorage is missing (Node/tests) or blocked. */
let memoryGlobalLearning = [];

function storageAvailable() {
  try {
    return typeof localStorage !== "undefined" && !!localStorage;
  } catch {
    return false;
  }
}

/**
 * Compact signature for matching prior fills.
 * @param {{ buildingType?: string, totalUnits?: number|string, is1to3Family?: boolean }} answers
 */
export function loadLearningSignature(answers = {}) {
  const building = String(answers.buildingType || "Residential").toLowerCase();
  const units = Number(answers.totalUnits) || (answers.is1to3Family !== false ? 2 : 0);
  const family = answers.is1to3Family !== false ? "1-3" : "multi";
  return `${building}|u${units}|${family}`;
}

/**
 * Snapshot one completed load list for learning.
 * @param {object[]} loadItems
 * @param {object} answers
 * @param {{ jobId?: string, source?: string }} [meta]
 */
export function buildLoadLearningEntry(loadItems = [], answers = {}, meta = {}) {
  const items = (loadItems || [])
    .map((it) => normalizeLoadRow(it))
    .filter((it) => String(it.name || "").trim())
    .map((it) => ({
      catalogId: it.catalogId || matchCatalogId(it.name) || "custom",
      name: String(it.name || "").trim(),
      entryMode: resolveLoadEntryMode(it),
      phase: it.phase || "Single",
      qty: it.qty,
      kwEach: it.kwEach,
      hpEach: it.hpEach,
      totalKw: it.totalKw,
      unit: it.unit,
      singlePhaseCount: it.singlePhaseCount,
      threePhaseCount: it.threePhaseCount,
      lineKw: loadItemKw(it),
    }));
  if (!items.length) return null;
  return {
    ts: Date.now(),
    signature: loadLearningSignature(answers),
    totalKw: sumLoadKw(items),
    items,
    jobId: meta.jobId || "",
    source: meta.source || "create_case",
  };
}

/**
 * Merge a new entry into the history list (newest last, cap length).
 */
export function appendLoadLearning(history = [], entry) {
  if (!entry || !Array.isArray(entry.items) || !entry.items.length) {
    return Array.isArray(history) ? history.slice(-MAX_ENTRIES) : [];
  }
  const next = (Array.isArray(history) ? history : []).concat([entry]);
  return next.slice(-MAX_ENTRIES);
}

/**
 * Average numeric field from matching prior rows for one catalog id.
 */
function avgField(rows, field) {
  const nums = rows
    .map((r) => Number(r[field]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 1000) / 1000;
}

/**
 * Suggest load items from history for this signature.
 * Falls back to any prior entries if no signature match.
 * @returns {object[]|null} suggested rows or null if nothing learned
 */
export function suggestLoadItemsFromLearning(history = [], answers = {}) {
  const list = Array.isArray(history) ? history : [];
  if (!list.length) return null;
  const sig = loadLearningSignature(answers);
  const matched = list.filter((e) => e && e.signature === sig);
  const pool = matched.length ? matched : list;
  // Use last 5 similar fills
  const recent = pool.slice(-5);
  const byId = new Map();
  for (const entry of recent) {
    for (const it of entry.items || []) {
      const id = it.catalogId || matchCatalogId(it.name) || it.name;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(it);
    }
  }
  if (!byId.size) return null;
  const suggested = [];
  for (const [id, rows] of byId.entries()) {
    const sample = rows[rows.length - 1];
    const mode = resolveLoadEntryMode(sample);
    const row = {
      catalogId: sample.catalogId || matchCatalogId(sample.name) || "custom",
      name: sample.name,
      entryMode: mode,
      phase: sample.phase || "Single",
      unit: sample.unit,
      qty: avgField(rows, "qty") ?? sample.qty ?? "",
      kwEach: avgField(rows, "kwEach") ?? sample.kwEach ?? "",
      hpEach: avgField(rows, "hpEach") ?? sample.hpEach ?? "",
      totalKw: avgField(rows, "totalKw") ?? sample.totalKw ?? "",
      singlePhaseCount:
        avgField(rows, "singlePhaseCount") ?? sample.singlePhaseCount ?? 1,
      threePhaseCount:
        avgField(rows, "threePhaseCount") ?? sample.threePhaseCount ?? 0,
    };
    suggested.push(normalizeLoadRow(row));
  }
  // Stable-ish order: lighting first, then kitchen, etc.
  const order = [
    "kitchen_appliances",
    "lighting",
    "electric_stoves",
    "computers",
    "freezers",
    "space_cooling",
    "common_lighting",
    "ev_unit",
    "ev_charger",
    "motors",
  ];
  suggested.sort((a, b) => {
    const ia = order.indexOf(a.catalogId);
    const ib = order.indexOf(b.catalogId);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return suggested;
}

/**
 * Prefill map: catalogId → learned defaults for makeLoadItemFromCatalog.
 */
export function learnedDefaultsByCatalog(history = [], answers = {}) {
  const items = suggestLoadItemsFromLearning(history, answers) || [];
  const map = {};
  for (const it of items) {
    const id = it.catalogId || matchCatalogId(it.name);
    if (id) map[id] = it;
  }
  return map;
}

/** Read global (cross-job) load learning history from this device. */
export function readGlobalLoadLearning() {
  if (storageAvailable()) {
    try {
      const raw = localStorage.getItem(GLOBAL_LS_KEY);
      if (!raw) return memoryGlobalLearning.slice(-MAX_ENTRIES);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
    } catch {
      return memoryGlobalLearning.slice(-MAX_ENTRIES);
    }
  }
  return memoryGlobalLearning.slice(-MAX_ENTRIES);
}

/** Persist global load learning history on this device. */
export function writeGlobalLoadLearning(history = []) {
  const next = Array.isArray(history) ? history.slice(-MAX_ENTRIES) : [];
  memoryGlobalLearning = next;
  if (storageAvailable()) {
    try {
      localStorage.setItem(GLOBAL_LS_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode — memory still holds it for this session */
    }
  }
  return next;
}

/** Test helper — clear device-global learning bag. */
export function clearGlobalLoadLearning() {
  memoryGlobalLearning = [];
  if (storageAvailable()) {
    try {
      localStorage.removeItem(GLOBAL_LS_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Merge job-level + global history (dedupe by ts+jobId), newest last.
 * @param {object[]} jobHistory
 * @param {object[]} [globalHistory]
 */
export function mergeLoadLearningHistories(jobHistory = [], globalHistory = []) {
  const list = []
    .concat(Array.isArray(jobHistory) ? jobHistory : [])
    .concat(Array.isArray(globalHistory) ? globalHistory : [])
    .filter((e) => e && Array.isArray(e.items) && e.items.length);
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const key = `${e.ts || 0}|${e.jobId || ""}|${e.signature || ""}|${e.totalKw || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  return out.slice(-MAX_ENTRIES);
}

/**
 * Append one entry to job history + global store. Returns next job history.
 */
export function recordLoadLearning(jobHistory = [], entry) {
  const nextJob = appendLoadLearning(jobHistory, entry);
  if (entry) {
    const global = appendLoadLearning(readGlobalLoadLearning(), entry);
    writeGlobalLoadLearning(global);
  }
  return nextJob;
}
